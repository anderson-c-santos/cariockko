import Link from "next/link";

const levels = [
  {
    id: "beginner",
    title: "Beginner",
    titlePt: "Iniciante",
    description: "Simple vocabulary and basic conversations",
    descriptionPt: "Vocabulário simples e conversas básicas",
    color: "bg-green-500",
    hoverColor: "hover:bg-green-600",
  },
  {
    id: "intermediate",
    title: "Intermediate",
    titlePt: "Intermediário",
    description: "Everyday topics and longer sentences",
    descriptionPt: "Tópicos do dia a dia e frases mais longas",
    color: "bg-yellow-500",
    hoverColor: "hover:bg-yellow-600",
  },
  {
    id: "advanced",
    title: "Advanced",
    titlePt: "Avançado",
    description: "Complex discussions and nuanced language",
    descriptionPt: "Discussões complexas e linguagem sofisticada",
    color: "bg-red-500",
    hoverColor: "hover:bg-red-600",
  },
];

export default function Home() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-2">Cariocko</h1>
        <p className="text-lg text-gray-600">
          Aprenda inglês conversando
        </p>
        <p className="text-sm text-gray-500 mt-1">
          Practice English through interactive dialogues
        </p>
      </div>

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4 text-center">
          Escolha seu nível / Choose your level
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {levels.map((level) => (
            <Link
              key={level.id}
              href={`/lessons/${level.id}`}
              className="block"
            >
              <div
                className={`${level.color} ${level.hoverColor} text-white rounded-xl p-6 transition-all hover:shadow-lg hover:scale-[1.02]`}
              >
                <h3 className="text-2xl font-bold mb-1">{level.titlePt}</h3>
                <p className="text-sm opacity-90 mb-2">{level.title}</p>
                <p className="text-xs opacity-80">{level.descriptionPt}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
