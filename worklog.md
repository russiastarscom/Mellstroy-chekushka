# Worklog

---
Task ID: 1
Agent: Super Z (main)
Task: Треш-платформер «Мелстрой: Мировая Чекушка» (HTML5, PWA, Mario-style)

Work Log:
- Инициализировал fullstack-окружение (init-fullstack.sh), Next.js используется только как хостинг; сама игра — чистая статика в public/game/ (index.html + css/ + js/ + image/)
- Сгенерировал через z-ai CLI 9 ассетов: andrey, burmaldenets, boss, checkushka, factory (на маджента-фоне), bg_fields, bg_city, bg_district, bg_plant. Параллельные вызовы CLI зависают — только последовательные
- scripts/process_sprites.py: хромакей мадженты + despill + flood-fill от краёв (фон бутылки оказался красным — лечится flood по r-max(g,b)>50) + бинаризация альфы + crop/resize
- scripts/gen_icons.py: PWA-иконки 192/512/maskable (пиксельная бутылка «МЧ»)
- Код игры: js/config.js (соцсети, константы), audio.js (WebAudio чиптюн), sprites.js (загрузчик image/ с встроенными фолбэк-заглушками), levels.js (4 карты-массивы + диалоги), entities.js (физика тайлов, Player, Walker, Thrower+Tomahawk, Boss, Bottle, Heart, FactoryExit), ui.js (меню/HUD/диалоги с печатью текста/катсцены), main.js (стейт-машина, рендер, параллакс, частицы, localStorage, SW)
- PWA: manifest.json (fullscreen, landscape), sw.js (network-first + офлайн-кэш — заменённые спрайты подхватываются сразу)
- page.tsx → redirect('/game/index.html')
- Agent Browser E2E: меню ✓, катсцена ✓, карта 1 (движение/прыжок/сбор чекушки/урон/стомп 5→4 врагов) ✓, game over ✓, босс-арена с HP-баром ✓, финал «ПРОДОЛЖЕНИЕ СЛЕДУЕТ» + соцсети ✓, экран «В разработке» ✓, выбор уровня с локами ✓. Консоль без ошибок. bun run lint — чисто

Stage Summary:
- Игра готова и проверена в браузере. Уровни: 1-вступление, 2-4 карты, 5-босс+финал, 6-в разработке
- Спрайты меняются простым копированием PNG в image/ (имена в README.txt)
- Соцсети финального экрана: js/config.js → CONFIG.SOCIALS
- Артефакты: public/game/ (исходник игры), download/melstroy-chekushka-game.zip (2.8 МБ, 27 файлов)
- Отладочный хук для тестов: window.GameDebug (startLevel/finishLevel/player/enemies)
