// El "pemie.ai" gigante del hero: cada letra entra con una animación escalonada
// y salta al hover. Puerto del efecto `letterIn` del prototipo `<x-dc>`.

const LETTERS = ["p", "e", "m", "i", "e"] as const;
const DOMAIN = [".", "a", "i"] as const;
const ROTATIONS = [-6, 5, -4, 6, -5, 5, -6, 6];

export function AnimatedWordmark() {
  let index = -1;
  const next = () => {
    index += 1;
    return index;
  };

  return (
    <h1 className="m-0 whitespace-nowrap text-hero font-extrabold text-ink-900">
      {LETTERS.map((letter) => {
        const order = next();
        return <Letter key={order} char={letter} order={order} rotation={ROTATIONS[order]} />;
      })}
      {DOMAIN.map((letter) => {
        const order = next();
        return <Letter key={order} char={letter} order={order} rotation={ROTATIONS[order]} accent />;
      })}
    </h1>
  );
}

function Letter({
  char,
  order,
  rotation,
  accent = false,
}: {
  char: string;
  order: number;
  rotation: number;
  accent?: boolean;
}) {
  return (
    <span
      className="inline-block animate-letter-in"
      style={{ animationDelay: `${0.05 + order * 0.06}s` }}
    >
      <span
        className={`inline-block cursor-default transition-[transform,color] duration-150 ease-out motion-reduce:!transform-none ${
          accent ? "text-blue-600 hover:text-ink-900" : "hover:text-blue-600"
        }`}
        onMouseEnter={(e) => (e.currentTarget.style.transform = `translateY(-14px) rotate(${rotation}deg)`)}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "")}
      >
        {char}
      </span>
    </span>
  );
}
