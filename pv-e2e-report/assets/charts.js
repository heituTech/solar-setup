(function () {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();
  var passC = style.getPropertyValue('--pass').trim();
  var failC = style.getPropertyValue('--fail').trim();

  var c1 = echarts.init(document.getElementById('chart-status'), null, { renderer: 'svg' });
  c1.setOption({
    animation: false,
    tooltip: { trigger: 'item', appendToBody: true },
    legend: { bottom: 0, textStyle: { color: muted } },
    series: [{
      type: 'pie',
      radius: ['48%', '72%'],
      center: ['50%', '46%'],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: '#fff', borderWidth: 2 },
      label: { color: ink, formatter: '{b}: {c}' },
      labelLine: { lineStyle: { color: rule } },
      data: [
        { value: 50, name: '通过 PASS', itemStyle: { color: passC } },
        { value: 4, name: '失败 FAIL', itemStyle: { color: failC } }
      ]
    }]
  });
  window.addEventListener('resize', function () { c1.resize(); });

  var c2 = echarts.init(document.getElementById('chart-roles'), null, { renderer: 'svg' });
  c2.setOption({
    animation: false,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, appendToBody: true },
    legend: { top: 0, textStyle: { color: muted } },
    grid: { left: 8, right: 16, bottom: 8, top: 44, containLabel: true },
    xAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: rule } }, axisLabel: { color: muted } },
    yAxis: { type: 'category', data: ["未登录访客","会员","销售","销售经理","超级管理员","电气工程师","结构工程师","仓库","财务","售后人员","售后经理","系统 / 性能"], axisLabel: { color: ink, fontSize: 11 }, axisLine: { lineStyle: { color: rule } }, axisTick: { show: false } },
    series: [
      { name: '通过', type: 'bar', stack: 'total', data: [3,4,7,6,6,7,1,2,4,3,6,1], itemStyle: { color: passC }, barMaxWidth: 18 },
      { name: '失败', type: 'bar', stack: 'total', data: [0,1,2,0,0,0,0,0,0,0,1,0], itemStyle: { color: failC }, barMaxWidth: 18 }
    ]
  });
  window.addEventListener('resize', function () { c2.resize(); });

  var c3 = echarts.init(document.getElementById('chart-perf'), null, { renderer: 'svg' });
  c3.setOption({
    animation: false,
    tooltip: { trigger: 'axis', appendToBody: true },
    legend: { top: 0, textStyle: { color: muted } },
    grid: { left: 8, right: 16, bottom: 8, top: 44, containLabel: true },
    xAxis: { type: 'category', data: ["/pv/api/health","/pv/api/workbench/orders","/pv/api/workbench/customers?page_size=100"], axisLabel: { color: ink, fontSize: 11, interval: 0, width: 130, overflow: 'break' }, axisLine: { lineStyle: { color: rule } } },
    yAxis: { type: 'value', name: 'ms', nameTextStyle: { color: muted }, splitLine: { lineStyle: { color: rule } }, axisLabel: { color: muted } },
    series: [
      { name: '平均', type: 'bar', data: [2,4,3], itemStyle: { color: accent }, barMaxWidth: 30 },
      { name: '最大', type: 'bar', data: [4,7,3], itemStyle: { color: accent2 + '99' }, barMaxWidth: 30 }
    ]
  });
  window.addEventListener('resize', function () { c3.resize(); });
})();
