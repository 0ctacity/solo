# Solid RC.4 list-driver benchmark

This benchmark compares Solid's classic universal reconciliation with Solo's
RC.4 patch list driver for the specific eligible case implemented in issue
#18: a 1,000-row store array whose first row moves to the end.

Run it with:

```sh
cd packages/solid
bun run bench:list-driver
```

The benchmark excludes initial mount, performs 20 warmup updates, then records
the median of seven 100-update trials. Both variants build the same one-element
row and update through Solo's `MockNativeRenderer` batching path.

## Recorded result

Measured 2026-09-01 on arm64 macOS 15.7.8 with Bun 1.4.0:

| Path | Median for 100 updates | Native ops per update |
| --- | ---: | ---: |
| Classic universal reconciliation | 93.15 ms | 4 |
| RC.4 patch list driver | 69.00 ms | 1 |

The measured speedup was 1.35× for this synthetic, compiler-proven store-list
case. This is not a Newsprint benchmark: its current article list uses an
explicit key function, a derived array, and a component row, so it correctly
remains on classic reconciliation.
