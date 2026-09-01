import { types as t } from "@babel/core"
import type { NodePath, PluginObj } from "@babel/core"

const RUNTIME_MODULE = "@solo/solid/runtime"

type Expression = t.Expression

function propertyName(property: t.ObjectProperty["key"]): string | undefined {
  if (t.isIdentifier(property)) return property.name
  if (t.isStringLiteral(property)) return property.value
  return undefined
}

function isEligibleExpression(node: t.Node, subject: string): node is Expression {
  switch (node.type) {
    case "Identifier":
      return node.name === subject || node.name === "undefined"
    case "MemberExpression":
      if (node.computed) {
        if (!t.isStringLiteral(node.property) && !t.isNumericLiteral(node.property)) {
          return false
        }
      } else if (!t.isIdentifier(node.property)) {
        return false
      }
      return isEligibleExpression(node.object, subject)
    case "StringLiteral":
    case "NumericLiteral":
    case "BooleanLiteral":
    case "NullLiteral":
    case "BigIntLiteral":
      return true
    case "ConditionalExpression":
      return (
        isEligibleExpression(node.test, subject) &&
        isEligibleExpression(node.consequent, subject) &&
        isEligibleExpression(node.alternate, subject)
      )
    case "BinaryExpression":
      if (node.operator === "in" || node.operator === "instanceof") return false
      return (
        isEligibleExpression(node.left, subject) &&
        isEligibleExpression(node.right, subject)
      )
    case "LogicalExpression":
      return (
        isEligibleExpression(node.left, subject) &&
        isEligibleExpression(node.right, subject)
      )
    case "UnaryExpression":
      if (node.operator === "delete" || node.operator === "throw") return false
      return isEligibleExpression(node.argument, subject)
    case "TemplateLiteral":
      return node.expressions.every((expression) =>
        isEligibleExpression(expression, subject),
      )
    case "ParenthesizedExpression":
      return isEligibleExpression(node.expression, subject)
    default:
      return false
  }
}

function replaceSubject(node: t.Node, subject: string, replacement: t.Expression): t.Node {
  const copy = t.cloneNode(node, true)

  const visit = (current: t.Node): t.Node => {
    if (t.isIdentifier(current) && current.name === subject) {
      return t.cloneNode(replacement, true)
    }
    if (t.isMemberExpression(current)) {
      current.object = visit(current.object) as t.Expression
      if (current.computed) {
        current.property = visit(current.property) as t.Expression
      }
      return current
    }
    for (const key of Object.keys(current)) {
      if (key === "loc" || key === "start" || key === "end") continue
      const value = (current as unknown as Record<string, unknown>)[key]
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const child = value[i]
          if (child && typeof child === "object" && "type" in child) {
            value[i] = visit(child as t.Node)
          }
        }
      } else if (value && typeof value === "object" && "type" in value) {
        ;(current as unknown as Record<string, unknown>)[key] = visit(value as t.Node)
      }
    }
    return current
  }

  return visit(copy)
}

function runtimeImportNames(program: t.Program): Map<string, Set<string>> {
  const names = new Map<string, Set<string>>()
  for (const statement of program.body) {
    if (!t.isImportDeclaration(statement) || statement.source.value !== RUNTIME_MODULE) {
      continue
    }
    for (const specifier of statement.specifiers) {
      if (!t.isImportSpecifier(specifier) || !t.isIdentifier(specifier.imported)) {
        continue
      }
      let locals = names.get(specifier.imported.name)
      if (!locals) {
        locals = new Set<string>()
        names.set(specifier.imported.name, locals)
      }
      locals.add(specifier.local.name)
    }
  }
  return names
}

function isHelperCall(statement: t.Statement, names: Set<string>): boolean {
  return (
    t.isExpressionStatement(statement) &&
    t.isCallExpression(statement.expression) &&
    t.isIdentifier(statement.expression.callee) &&
    names.has(statement.expression.callee.name)
  )
}

function makePatchStatements(
  call: t.CallExpression,
  subject: string,
  force: t.Identifier,
): t.Statement[] | undefined {
  if (call.arguments.length !== 2) return undefined
  const [accessor, callback] = call.arguments
  if (!t.isArrowFunctionExpression(accessor) || !t.isExpression(accessor.body)) {
    return undefined
  }
  if (!isEligibleExpression(accessor.body, subject)) return undefined
  if (!t.isArrowFunctionExpression(callback)) return undefined
  if (callback.params.length > 2) return undefined

  const next = t.identifier("_n$")
  const value = t.identifier("_v$")
  const current = replaceSubject(accessor.body, subject, next) as Expression
  const previous = replaceSubject(
    accessor.body,
    subject,
    t.identifier("_p$"),
  ) as Expression
  const callbackArgs = (valueExpression: Expression, previousExpression: Expression) =>
    t.expressionStatement(
      t.callExpression(t.cloneNode(callback), [valueExpression, previousExpression]),
    )

  return [
    t.variableDeclaration("const", [
      t.variableDeclarator(value, current),
    ]),
    t.ifStatement(
      t.cloneNode(force),
      callbackArgs(t.cloneNode(value), t.identifier("undefined")),
      t.ifStatement(
        t.binaryExpression("!==", t.cloneNode(value), t.cloneNode(previous)),
        callbackArgs(t.cloneNode(value), previous),
      ),
    ),
  ]
}

function compiledRowStatements(row: t.ArrowFunctionExpression): t.Statement[] | undefined {
  if (t.isBlockStatement(row.body)) return row.body.body
  if (
    t.isCallExpression(row.body) &&
    row.body.arguments.length === 0 &&
    t.isArrowFunctionExpression(row.body.callee) &&
    t.isBlockStatement(row.body.callee.body)
  ) {
    return row.body.callee.body.body
  }
  return undefined
}

function rowIsEligible(
  row: t.ArrowFunctionExpression,
  effectNames: Set<string>,
  insertNames: Set<string>,
  insertNodeNames: Set<string>,
  patchDriverLocal: t.Identifier,
): boolean {
  if (row.params.length !== 1 || !t.isIdentifier(row.params[0])) return false
  const statements = compiledRowStatements(row)
  if (!statements) return false
  const returnStatement = statements.at(-1)
  if (!returnStatement || !t.isReturnStatement(returnStatement) || !t.isIdentifier(returnStatement.argument)) {
    return false
  }
  const rootName = returnStatement.argument.name

  let rootCreated = false
  let firstEffect = -1
  const patches: t.Statement[] = []
  for (let index = 0; index < statements.length - 1; index++) {
    const statement = statements[index]
    if (t.isVariableDeclaration(statement)) {
      if (
        statement.declarations.some(
            (declaration) =>
              t.isIdentifier(declaration.id) &&
            declaration.id.name === rootName,
        )
      ) {
        rootCreated = true
      }
      continue
    }
    // A dynamic universal `insert` owns a reactive computation. Static
    // `insertNode` calls only wire compiler-created descendants and are the
    // universal equivalent of nodes baked into a DOM template.
    if (isHelperCall(statement, insertNames)) return false
    if (!isHelperCall(statement, insertNodeNames)) {
      if (!isHelperCall(statement, effectNames)) return false
      if (!t.isExpressionStatement(statement) || !t.isCallExpression(statement.expression)) {
        return false
      }
      const patch = makePatchStatements(
        statement.expression,
        row.params[0].name,
        t.identifier("_f$"),
      )
      if (!patch) return false
      if (firstEffect === -1) firstEffect = index
      patches.push(...patch)
    }
  }
  if (!rootCreated) return false

  if (firstEffect !== -1) {
    const body = statements
    const patchStatement = t.expressionStatement(
      t.callExpression(patchDriverLocal, [
        t.identifier(row.params[0].name),
        t.arrowFunctionExpression(
          [t.identifier("_n$"), t.identifier("_p$"), t.identifier("_f$")],
          t.blockStatement(patches),
        ),
      ]),
    )
    const rewritten: t.Statement[] = []
    let inserted = false
    for (const statement of body) {
      const isEffect =
        t.isExpressionStatement(statement) &&
        t.isCallExpression(statement.expression) &&
        t.isIdentifier(statement.expression.callee) &&
        effectNames.has(statement.expression.callee.name)
      if (isEffect) {
        if (!inserted) {
          rewritten.push(patchStatement)
          inserted = true
        }
      } else {
        rewritten.push(statement)
      }
    }
    body.splice(0, body.length, ...rewritten)
  }
  return true
}

/**
 * The RC.4 patch proof is emitted by the DOM compiler path. Solo must keep
 * `generate: "universal"`, so this small post-pass applies the same proof and
 * patch body to universal intrinsic rows without importing @solidjs/web.
 */
export function universalPatchCompiler(): PluginObj {
  return {
    name: "solo:universal-patch-compiler",
    visitor: {
      Program: {
        exit(programPath: NodePath<t.Program>) {
          const forLocals = new Set<string>()
          for (const statement of programPath.node.body) {
            if (!t.isImportDeclaration(statement) || statement.source.value !== "solid-js") continue
            for (const specifier of statement.specifiers) {
              if (
                t.isImportSpecifier(specifier) &&
                t.isIdentifier(specifier.imported) &&
                specifier.imported.name === "For"
              ) {
                forLocals.add(specifier.local.name)
              }
            }
          }
          if (forLocals.size === 0) return

          const runtimeNames = runtimeImportNames(programPath.node)
          const effectNames = runtimeNames.get("effect") ?? new Set<string>()
          const insertNames = runtimeNames.get("insert") ?? new Set<string>()
          const insertNodeNames = runtimeNames.get("insertNode") ?? new Set<string>()
          const helperLocals = new Map<string, t.Identifier>()
          const ensureHelper = (name: string): t.Identifier => {
            const existing = helperLocals.get(name)
            if (existing) return existing
            for (const statement of programPath.node.body) {
              if (!t.isImportDeclaration(statement) || statement.source.value !== RUNTIME_MODULE) continue
              for (const specifier of statement.specifiers) {
                if (t.isImportSpecifier(specifier) && t.isIdentifier(specifier.imported) && specifier.imported.name === name) {
                  helperLocals.set(name, specifier.local)
                  return specifier.local
                }
              }
            }
            const local = programPath.scope.generateUidIdentifier(name)
            helperLocals.set(name, local)
            return local
          }

          const proveRow = (row: t.ArrowFunctionExpression): t.CallExpression | undefined => {
            const patchDriverPlaceholder = t.identifier("_soloPatchDriver$")
            if (
              !rowIsEligible(
                row,
                effectNames,
                insertNames,
                insertNodeNames,
                patchDriverPlaceholder,
              )
            ) {
              return undefined
            }
            const statements = compiledRowStatements(row)
            if (!statements) return undefined
            statements.forEach((statement: t.Statement) => {
              if (
                t.isExpressionStatement(statement) &&
                t.isCallExpression(statement.expression) &&
                t.isIdentifier(statement.expression.callee) &&
                statement.expression.callee.name === patchDriverPlaceholder.name
              ) {
                statement.expression.callee = ensureHelper("patchDriver")
              }
            })
            return t.callExpression(ensureHelper("rowProof"), [row])
          }

          programPath.traverse({
            CallExpression(path) {
              const [component, props] = path.node.arguments
              if (!t.isIdentifier(component) || !forLocals.has(component.name)) return
              if (!t.isObjectExpression(props)) return
              if (
                props.properties.some(
                  (property) =>
                    (t.isObjectProperty(property) || t.isObjectMethod(property)) &&
                    (propertyName(property.key) === "keyed" || propertyName(property.key) === "fallback"),
                )
              ) return
              const children = props.properties.find(
                (property): property is t.ObjectProperty =>
                  t.isObjectProperty(property) && propertyName(property.key) === "children",
              )
              if (!children) return
              if (t.isArrowFunctionExpression(children.value)) {
                const proof = proveRow(children.value)
                if (proof) children.value = proof
                return
              }
              if (!t.isIdentifier(children.value)) return
              const binding = path.scope.getBinding(children.value.name)
              if (!binding?.constant || !binding.path.isVariableDeclarator()) return
              const initializer = binding.path.node.init
              if (!t.isArrowFunctionExpression(initializer)) return
              const proof = proveRow(initializer)
              if (proof) binding.path.get("init").replaceWith(proof)
            },
          })

          if (helperLocals.size === 0) return
          const specifiers = [...helperLocals.entries()]
            .filter(([name]) => !runtimeNames.has(name))
            .map(([name, local]) => t.importSpecifier(local, t.identifier(name)))
          if (specifiers.length > 0) {
            programPath.unshiftContainer(
              "body",
              t.importDeclaration(specifiers, t.stringLiteral(RUNTIME_MODULE)),
            )
          }
        },
      },
    },
  }
}
