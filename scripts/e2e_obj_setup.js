(async () => {
  // 1. создать объект через настоящий обработчик кнопки
  document.getElementById('btn-obj-add').click();
  const o = window.ADMIN.CMS.objects[0];
  if (!o) return 'FAIL: no object';
  o.name = 'Бочка';
  o.emoji = '🛢';
  o.w = 36; o.h = 44;
  o.tex = '/api/game-cms/file/object-mu4a225pl6mm3.png';
  o.texId = 'object-mu4a225pl6mm3';
  o.script = 'obj.hp = 6; obj.maxHp = 6; obj.stompable = true; obj.dangerous = true; obj.vx = 70 * obj.dir; api.gravity(obj, dt); if (api.solid(obj)) obj.dir = -obj.dir;';
  window.ADMIN.renderAll.objects();
  window.ADMIN.buildCustomTools();
  // 2. поставить объект на текущую карту (колонка 15, ряд 9)
  window.ADMIN.paint(15, 9, '@' + o.id);
  const def = window.ADMIN.stateToDef(window.ADMIN.CMS.maps[window.ADMIN.curMap]);
  // 3. опубликовать
  const pub = await window.ADMIN.publish();
  return JSON.stringify({ ok: !!pub, id: o.id, custom: def.custom || null, tools: document.querySelectorAll('#custom-tools .tool').length });
})()
