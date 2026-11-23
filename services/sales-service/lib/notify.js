'use strict';

const { internalFetch } = require('@solar/service-kit');

async function notify(app, payload) {
  const base = app.config && app.config.internal && app.config.internal.services
    && app.config.internal.services.identity;
  if (!base) return;
  try {
    await internalFetch(`${base}/internal/notifications`, {
      service: app.config.serviceName,
      body: payload,
    });
  } catch (error) {
    app.logger.warn('[notify] %s', error.message);
  }
}

function notifyOrderCreated(app, { salespersonId, orderNo, customerName }) {
  const userIds = salespersonId ? [Number(salespersonId)] : [];
  return notify(app, {
    user_ids: userIds,
    roles: ['sales_manager', 'after_sales_manager', 'super_admin'],
    title: '新订单已创建',
    content: `订单 ${orderNo}（客户：${customerName || '-'}）已创建。`,
    type: 'order',
    link: '/workbench/orders',
  });
}

module.exports = { notify, notifyOrderCreated };
