const STATUS_TYPES = {
  lead: 'info', qualified: 'warning', won: 'success', lost: 'danger',
  draft: 'info', pending_review: 'warning', approved: 'success', accepted: 'success', converted: 'success', rejected: 'danger',
  initializing: 'info', pending_assignment: 'warning', in_delivery: 'warning', cancelled: 'danger', void: 'danger',
  submitted: 'warning', reviewed: 'success', completion_pending: 'warning', completed: 'success', invalid: 'danger',
  pending: 'info', in_stock: 'warning', delivered: 'warning', installed: 'success',
  open: 'danger', in_progress: 'warning', resolved: 'success', closed: 'info',
  confirmed: 'warning', paid: 'success', active: 'success', disabled: 'info',
};

export function statusType(status) {
  return STATUS_TYPES[status] || 'info';
}

export function money(value, currency = 'USD') {
  const number = Number(value || 0);
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency, maximumFractionDigits: 2,
  }).format(number);
}

export function dt(value) {
  if (!value) return '-';
  return String(value).replace('T', ' ').slice(0, 16);
}

export function dateOnly(value) {
  if (!value) return '-';
  return String(value).replace('T', ' ').slice(0, 10);
}

export function currentPeriod(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function roleKey(role) {
  return role || 'member';
}
