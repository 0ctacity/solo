import { describe, expect, it } from "vitest"
import { createSystemAppearance, Text } from "@solo/solid"
import { createSolidNativeTestRoot, hasNativeTestRenderer } from "../testing.js"

describe.skipIf(!hasNativeTestRenderer)("native system appearance", () => {
  it("exposes the same appearance capability through the GPU-backed test renderer", () => {
    const root = createSolidNativeTestRoot()
    try {
      const App = () => {
        const appearance = createSystemAppearance()
        return <Text>{appearance()}</Text>
      }
      root.render(App)
      expect(root.getAllText()).toHaveLength(1)
      expect(root.getAllText()[0]).toMatch(/^(light|dark)$/)
      root.render(App)
      expect(root.getAllText()[0]).toMatch(/^(light|dark)$/)
    } finally {
      root.unmount()
    }
  })
})
