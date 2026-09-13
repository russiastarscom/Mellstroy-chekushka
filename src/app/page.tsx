import { redirect } from 'next/navigation';

// Игра — чистая статика (index.html + image/), лежит в public/game/.
// Корневой маршрут просто перекидывает на неё.
export default function Home() {
  redirect('/game/index.html');
}
