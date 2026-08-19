# Sample Posts

## React useEffect cleanup

1. (Score: 88 — Value Bomb)
   "useEffect cleanup functions run BEFORE the next effect, not on unmount.

   This one misunderstanding causes 90% of React memory leaks.

   return () => controller.abort()  // runs every re-render

   Bookmark this. You'll need it."

2. (Score: 82 — Code Snippet)
   "TIL: You can abort fetch requests in useEffect cleanup.

   useEffect(() => {
     const ctrl = new AbortController()
     fetch(url, { signal: ctrl.signal })
     return () => ctrl.abort()
   }, [url])

   No more race conditions."

3. (Score: 76 — Hot Take)
   "Hot take: If you need useEffect, you probably have a design problem.

   React 19 gave us use(), Server Components, and Actions.

   useEffect is the new componentDidMount — a code smell."

## JavaScript structuredClone

1. (Score: 90 — Value Bomb)
   "Stop using JSON.parse(JSON.stringify(obj)) to deep clone.

   JavaScript has structuredClone() now.

   It handles: dates, maps, sets, arrays, nested objects.
   It's faster. It's native. It's supported everywhere.

   Bookmark this."

2. (Score: 83 — Code Snippet)
   "TIL: structuredClone() exists natively in JavaScript.

   const original = { date: new Date(), data: [1, 2, 3] }
   const copy = structuredClone(original)
   
   // Works with Date, Map, Set, ArrayBuffer, Error
   // JSON.parse hack destroys all of these"

3. (Score: 78 — Question)
   "How many of you are still doing JSON.parse(JSON.stringify(obj)) to deep clone?

   JavaScript has had structuredClone() since 2022.

   What other 'modern' JS features are you sleeping on?"

## Docker tips

1. (Score: 85 — Value Bomb)
   "Your Docker images are 3x bigger than they need to be.

   Use multi-stage builds:
   Stage 1: Build with all deps
   Stage 2: Copy only the binary

   Our Go API went from 1.2GB to 12MB.

   Save this for your next Dockerfile."

2. (Score: 80 — Hot Take)
   "Unpopular opinion: Docker Compose is all you need for 90% of production deployments.

   Not Kubernetes. Not ECS. Not Nomad.

   A $40/mo VPS + Docker Compose + a health check.

   Fight me."

3. (Score: 77 — Question)
   "What's the most cursed thing you've seen in a Dockerfile?

   I'll start: a 47-layer image that installed Python, Node, Java, AND Ruby 'just in case.'"
