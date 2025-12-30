/**
 * SignalsView
 * 
 * Route: /signals/:scale
 * 
 * Displays signals (Tripdar layer) at specified scale.
 * 
 * Scale parameter:
 * - "macro" - macro experiences (comparative + descriptive)
 * - "microdose" - microdose experiences (comparative + reflective)
 * 
 * This route:
 * - Shows signals from ops.originalpsilly.com (read-only)
 * - Maintains separation from stories (Triptales)
 * - Supports comparative viewing without metrics/scores/rankings
 * - No data mutation
 */

import { useParams } from 'react-router-dom'

function SignalsView() {
  const { scale } = useParams<{ scale: 'macro' | 'microdose' }>()
  
  // Validate scale parameter
  const validScale = scale === 'macro' || scale === 'microdose' ? scale : 'macro'
  
  // TODO: Read signals from ops.originalpsilly.com (read-only)
  // TODO: Implement comparative view (read-only, no metrics)
  // All operations are read-only, no data mutation
  
  return (
    <div>
      <h1>SignalsView Placeholder</h1>
      <p>Route: /signals/:scale (Tripdar layer)</p>
      <p>Scale: {validScale}</p>
      {/* Placeholder for signals display */}
      {/* Navigation placeholder: can switch to stories or other scale */}
    </div>
  )
}

export default SignalsView

