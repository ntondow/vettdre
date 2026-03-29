# API Integration Pattern
When building a new API integration:
1. Create src/lib/{service}.ts with:
   - LRU cache with appropriate TTL
   - Graceful degradation (return null if API unavailable)
   - Rate limit awareness
   - TypeScript interfaces for all responses
2. Create server action in the appropriate actions.ts file
3. Wire into data-fusion-engine.ts as a new PHASE
4. Add scoring adjustments (investment + distress) if applicable
5. Add to building-profile.tsx UI section
6. Add to ai-assumptions.ts context
7. Add feature gates in feature-gate.ts
8. Add to settings/api-keys page if new env var needed
9. Add to PDF report if relevant
10. Build and verify zero errors
