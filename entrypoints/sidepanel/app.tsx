import { useState } from "react";

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="flex min-w-80 flex-col items-center gap-4 p-6">
      <h1 className="font-semibold text-2xl">WXT + React</h1>
      <button
        className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:opacity-90"
        onClick={() => setCount((c) => c + 1)}
        type="button"
      >
        count is {count}
      </button>
      <p className="text-muted-foreground text-sm">Tailwind + shadcn ready</p>
    </div>
  );
}

export default App;
