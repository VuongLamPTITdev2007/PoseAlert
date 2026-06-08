(function(){
  // Bật bằng cách đặt window.__DEBUG__ = true trong console khi cần debug
  if (window.__DEBUG__ === undefined) window.__DEBUG__ = false;

  const orig = {};
  ['log','info','debug','warn','error'].forEach(k => {
    orig[k] = window.console && window.console[k] ? window.console[k].bind(window.console) : function(){};
  });

  if (!window.__DEBUG__) {
    ['log','info','debug','warn','error'].forEach(k => { window.console[k] = function(){}; });
  }

  // Helper an toàn để ghi log khi cần
  window.debugLog = function(...args) {
    if (window.__DEBUG__) orig.log(...args);
  };
})();
