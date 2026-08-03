// Saludo por franja horaria y sello de fecha del launchpad de workspaces.

export function greetingFor(date: Date, name?: string | null): string {
  const hour = date.getHours();
  const base =
    hour < 6 ? "Buenas madrugadas" : hour < 12 ? "Buenos días" : hour < 20 ? "Buenas tardes" : "Buenas noches";
  return name ? `${base}, ${name}` : base;
}

/** "DOM 2 AGO · 21:49" — armado a partir de partes para no depender de cómo el locale ordena la puntuación. */
export function stampFor(date: Date): string {
  const weekday = new Intl.DateTimeFormat("es", { weekday: "short" }).format(date).replace(/\./g, "");
  const day = new Intl.DateTimeFormat("es", { day: "numeric" }).format(date);
  const month = new Intl.DateTimeFormat("es", { month: "short" }).format(date).replace(/\./g, "");
  const time = new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  return `${weekday} ${day} ${month} · ${time}`.toUpperCase();
}
