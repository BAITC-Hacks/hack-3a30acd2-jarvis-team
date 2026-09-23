import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const businessSteps = [
  {
    title: "Опишите задачу",
    text: "Напишите своими словами, что не получается в работе и что хочется улучшить. Достаточно нескольких предложений.",
  },
  {
    title: "Уточните детали и опубликуйте",
    text: "Ответьте на короткие вопросы. Проверьте название, проблему, нужное решение и то, что команда должна передать вам. Затем опубликуйте задачу.",
  },
  {
    title: "Выберите команду",
    text: "Команды пришлют свои предложения, опыт и сроки. Сравните отклики в разделе «Мои задачи» и выберите одну команду.",
  },
];

export default function How() {
  return (
    <div className="page-container about-page">
      <h1>Как это работает</h1>
      <p className="lead">Бизнес размещает задачи. Команды предлагают решения. AI Sana помогает сделать описание понятным для обеих сторон.</p>

      <h2>Если вы представляете бизнес</h2>
      <div className="how-steps">
        {businessSteps.map((step, index) => (
          <section key={step.title}>
            <span>Шаг {index + 1}</span>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </section>
        ))}
      </div>

      <section className="surface how-team-guide">
        <h2>Если вы из команды</h2>
        <ol>
          <li>Зарегистрируйтесь как команда и заполните профиль: навыки, участников и ссылки на проекты.</li>
          <li>Найдите задачу в каталоге. Нажмите «Откликнуться» и расскажите, что вы предлагаете.</li>
          <li>Следите за ответом бизнеса в разделе «Моя команда» → «Мои отклики».</li>
        </ol>
      </section>

      <p className="application-help">Можно начать с черновика и вернуться к нему позже. Оценка полноты описания подскажет, какие детали ещё стоит добавить. Задачи с отметкой «Демо» — учебные примеры.</p>

      <div className="how-actions">
        <Button asChild><Link href="/challenges/new">Создать задачу <ArrowRight size={18} /></Link></Button>
        <Button asChild variant="outline"><Link href="/#catalog">Найти задачу</Link></Button>
      </div>
    </div>
  );
}
