/**
 * Test: primary-image info-panel demotion safety net
 *
 * Bug: for packaged goods (e.g. "Styrkr Bar50"), the AI crowned a nutrition-facts
 * panel as the PRIMARY image while a clean front-of-pack packshot sat unused.
 *
 * The route now demotes a primary whose AI `reason` reads like an info panel
 * (nutrition / ingredient / spec / back-of-pack / facts table / infographic / label)
 * when another selection does NOT read like a panel.
 *
 * This test replicates that pure resolution logic and verifies the behaviour.
 */

let passed = 0
let failed = 0
function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ ${message}`)
    passed++
  } else {
    console.error(`  ❌ FAIL: ${message}`)
    failed++
  }
}

type Selection = { index: number; isPrimary: boolean; reason: string }

// ── Logic under test (kept in sync with ai-select-candidates/route.ts) ──────
const INFO_PANEL_RE =
  /nutrition|ingredient|supplement\s*facts|\bfacts\b|spec(?:s|ification)?\b|sizing|directions|how to use|back[\s-]?of[\s-]?pack|\bpanel\b|infographic|label/i

function resolvePrimary(selections: Selection[]): number {
  let primaryIndex = selections.find((s) => s.isPrimary)?.index
  if (primaryIndex === undefined) primaryIndex = selections[0].index

  const reasonOf = (idx: number) => selections.find((s) => s.index === idx)?.reason || ''
  if (INFO_PANEL_RE.test(reasonOf(primaryIndex))) {
    const cleanPick = selections.find(
      (s) => s.index !== primaryIndex && !INFO_PANEL_RE.test(s.reason || ''),
    )
    if (cleanPick) primaryIndex = cleanPick.index
  }
  return primaryIndex
}

// ── Tests ───────────────────────────────────────────────────────────────────
console.log('\n📋 Test: primary info-panel demotion\n')

// 1: AI crowned a nutrition panel — should demote to the packshot
console.log('Test 1: nutrition-facts panel primary → demoted to packshot')
{
  const sel: Selection[] = [
    { index: 0, isPrimary: true, reason: 'Nutrition-facts panel, clean white bg' },
    { index: 1, isPrimary: false, reason: 'Front-of-pack hero packshot of the bar' },
    { index: 2, isPrimary: false, reason: 'Ingredient list close-up' },
  ]
  assert(resolvePrimary(sel) === 1, 'primary promoted to the packshot (index 1)')
}

// 2: legitimate packshot primary — left untouched
console.log('\nTest 2: genuine packshot primary → unchanged')
{
  const sel: Selection[] = [
    { index: 0, isPrimary: true, reason: 'Front-of-pack hero packshot on white bg' },
    { index: 1, isPrimary: false, reason: 'Nutrition-facts panel — supporting info only' },
  ]
  assert(resolvePrimary(sel) === 0, 'packshot primary kept (index 0)')
}

// 3: every selection is a panel — nothing better, keep AI primary (no false swap)
console.log('\nTest 3: all selections are panels → keep AI primary (no clean alt)')
{
  const sel: Selection[] = [
    { index: 0, isPrimary: true, reason: 'Supplement facts table' },
    { index: 1, isPrimary: false, reason: 'Back-of-pack ingredient panel' },
  ]
  assert(resolvePrimary(sel) === 0, 'kept index 0 — no non-panel alternative to swap to')
}

// 4: no isPrimary flag → falls back to first, then demotes if it is a panel
console.log('\nTest 4: no isPrimary flag, first is a spec sheet → demote to clean shot')
{
  const sel: Selection[] = [
    { index: 0, isPrimary: false, reason: 'Spec sheet / sizing chart' },
    { index: 1, isPrimary: false, reason: 'Clean studio shot of the product' },
  ]
  assert(resolvePrimary(sel) === 1, 'fell back to first, then demoted to clean shot (index 1)')
}

// 5: keyword coverage — each panel phrase is caught
console.log('\nTest 5: info-panel keyword coverage')
{
  const phrases = [
    'nutrition information',
    'ingredient breakdown',
    'supplement facts',
    'spec sheet',
    'specification table',
    'sizing chart',
    'directions for use',
    'how to use steps',
    'back-of-pack text',
    'back of pack',
    'callout panel',
    'feature infographic',
    'product label macro shot',
  ]
  phrases.forEach((p) => assert(INFO_PANEL_RE.test(p), `caught: "${p}"`))
}

// 6: genuine packshot phrases are NOT flagged
console.log('\nTest 6: packshot phrases not falsely flagged')
{
  const phrases = [
    'Front-of-pack hero packshot on white bg',
    'Angled product photo, studio lit',
    'Single front light, white background',
  ]
  phrases.forEach((p) => assert(!INFO_PANEL_RE.test(p), `not flagged: "${p}"`))
}

// ── Summary ──
console.log(`\n${'─'.repeat(55)}`)
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`)
if (failed > 0) {
  console.error('\n❌ Some tests failed')
  process.exit(1)
} else {
  console.log('\n✅ All tests passed')
}
