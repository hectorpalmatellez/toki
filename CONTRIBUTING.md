# Contributing to Toki

## Setup

1. Install [Node.js](https://nodejs.org/) 24+
2. Install [pnpm](https://pnpm.io/) 10+
3. Fork and clone the repository
4. Run `pnpm install`
5. Run `pnpm build` to verify the setup

## Development workflow

```bash
pnpm dev           # tsup --watch (recompile on changes)
pnpm test          # run all tests
pnpm test:watch    # run tests in watch mode
pnpm test:coverage # run tests with coverage report
pnpm typecheck     # TypeScript type checking (must pass)
pnpm lint          # oxlint (must pass with zero warnings)
pnpm format        # Prettier formatting
pnpm format:check  # check formatting
pnpm bench         # run performance benchmarks
```

## Code conventions

- **TypeScript strict mode** — zero tolerance for `any`, implicit `any`, or unchecked indexed access
- Use `const` by default; `let` only when reassignment is necessary; never `var`
- Prefer function expressions (`export const fn = () => {}`) over function declarations
- Use explicit return types for exported functions
- No unused variables or imports (oxlint enforces this)
- Single quotes for strings (Prettier enforces this)

## Adding a new generator

1. Create `src/generators/<platform>.ts`
2. Implement the `Generator` interface from `src/core/types.ts`
3. Register it in `src/generators/index.ts`
4. Add tests in `src/generators/<platform>.test.ts`
5. Run `pnpm test` and `pnpm typecheck`

## Testing

- Write tests alongside implementation, not after
- Tests use Vitest with `describe`/`it` blocks
- Snapshot test generator output (one snapshot per platform per token set)
- Coverage thresholds: 90% statements, 80% branches, 85% functions, 90% lines

## Pull request guidelines

1. Create a feature branch from `main`
2. Keep changes focused — one feature per PR
3. Add tests for any new functionality
4. Ensure all checks pass: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
5. Update documentation if changing public API or CLI behavior
6. Add a changelog entry under "Unreleased" in `CHANGELOG.md`
