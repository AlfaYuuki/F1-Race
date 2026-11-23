export function bindControls(game) {
  const keyMap={ArrowUp:'accelerate',KeyW:'accelerate',ArrowDown:'brake',KeyS:'brake',ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right'};
  const held=new Set();
  window.addEventListener('keydown',event=>{
    if(event.code==='Escape'){event.preventDefault();game.togglePause();return;}
    const action=keyMap[event.code];if(!action)return;
    event.preventDefault();held.add(action);game.setInput(action,true);
  });
  window.addEventListener('keyup',event=>{const action=keyMap[event.code];if(!action)return;held.delete(action);game.setInput(action,false);});
  window.addEventListener('blur',()=>{held.forEach(action=>game.setInput(action,false));held.clear();});
  document.querySelectorAll('[data-control]').forEach(button=>{
    const action=button.dataset.control;
    const down=event=>{event.preventDefault();button.setPointerCapture?.(event.pointerId);game.setInput(action,true);};
    const up=event=>{event.preventDefault();game.setInput(action,false);};
    button.addEventListener('pointerdown',down);
    ['pointerup','pointercancel','lostpointercapture'].forEach(type=>button.addEventListener(type,up));
  });
}
