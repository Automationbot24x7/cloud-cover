# WebStorm code inspections

WebStorm's inspector run headless over `src/` with the project's default profile:

```
inspect.bat <project> .idea/inspectionProfiles/Project_Default.xml <out> -v2 -format json -d src
```

| Inspection | Run 1 (before) | Run 2 (after task 005) | Notes |
| --- | ---: | ---: | --- |
| DuplicatedCode | 2 | 0 | Leaderboard rows were built twice; now one shared `boardRows.ts`. |
| JSUnusedGlobalSymbols | 1 | 0 | Dead `clearScores` removed. |
| CssUnresolvedCustomProperty | 4 | 0 | `--grade` given a default. |
| CssNoGenericFontName | 23 | 0 | Generic font fallbacks added. |
| GrazieInspection (grammar) | 8 | 0 | Comment wording fixed. |
| JSSuspiciousNameCombination | 2 | 0 | Intentional perpendicular `(-y, x)`, suppressed with a reason. |
| CssInvalidPropertyValue | 2 | 1 | Background shorthand split into longhands; last value order fixed after run 2. |
| CssRedundantUnit | 0 | 2 | `0% 0%` written as `0 0` after run 2. |
| PointlessArithmeticExpressionJS | 0 | 1 | `radius * 1.0` simplified after run 2. |
| CssUnusedSymbol | 34 | 32 | Expected: these classes are applied from TypeScript. |
| GrazieStyle | 7 | 6 | Expected: the project uses British spelling. |

Raw results: `run-1/` and `run-2/`.
