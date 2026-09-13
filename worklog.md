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

---
Task ID: 2
Agent: Super Z (main)
Task: Фиксы по фидбеку: автрастягивание на весь экран + баг «карта 1 не завершается у завода»

Work Log:
- Воспроизвёл баг в браузере: игрок проходит сквозь завод — уровень не завершается. Корень: FactoryExit рисовался от ROWS*TILE-140 (y=380), а поверхность земли — 11*TILE=440; зона-триггер двери (y 446..520) оказалась ПОД полом, игрок (ноги на 440) не мог в неё попасть
- entities.js: завод стоит на земле (GROUND_TOP=(ROWS-2)*TILE), триггер = всё здание +14px по краям, зелёная пульсирующая подсветка зоны при приближении, стрелка ▼ увеличена
- main.js: динамический VIEW_W (высота мира 540 неизменна, ширина = 540*aspect окна, клэмп 480..1920) → канвас тянется на весь экран без полос и искажений; resize/orientationchange; камера центрируется от VIEW_W*0.44; Fullscreen API: клавиша F, кнопка ⛶ в HUD, автофуллскрин при «ИГРАТЬ» (best-effort, try/catch)
- index.html: кнопка #btn-fullscreen в HUD; style.css: #stage 100vw/100dvh вместо letterbox 16:9
- levels.js: подсказка на карте 1 (c=114) «Завод впереди — дойди до него!»; sw.js: кэш v2
- E2E (agent-browser): канвас 864x540@1280x800, 1344x540@21:9, 540x540@1:1, 480x540@портрет, 960x540@16:9 ✓; карта 1 завершается у завода (диалог→«КАРТА ЗАЧИЩЕНА»→карта 2) ✓; босс-карта: locked не пускает, unlock→финал+соцсети ✓; консоль чистая

Stage Summary:
- Оба бага устранены и проверены. ZIP пересобран (download/melstroy-chekushka-game.zip, 2.8 МБ)
- GameDebug теперь отдаёт factory (locked/unlock для тестов)
