'use strict';

/**
 * 数据权限：
 *   - 管理员：全部数据
 *   - 店长 / 门店店员：仅本门店
 *   - 电气 / 结构工程师：仅指派给自己的项目（surveyor_id）
 *   - 施工队长：仅分配给自己的项目（captain_user_id）
 */

const STORE_ROLES = ['store_manager', 'store_clerk'];
const ENGINEER_ROLES = ['electrical_engineer', 'structural_engineer'];

const isAdmin = (user) => user.role === 'admin';
const isStoreRole = (user) => STORE_ROLES.includes(user.role);
const isEngineer = (user) => ENGINEER_ROLES.includes(user.role);
const isCaptain = (user) => user.role === 'construction_captain';

/** 门店级过滤条件，返回 { sql, params }，sql 为空串表示不限制。 */
function storeFilter(user, column = 'store_id') {
  if (isStoreRole(user)) return { sql: `${column} = ?`, params: [user.store_id] };
  return { sql: '', params: [] };
}

function assertStore(user, storeId) {
  if (isStoreRole(user) && Number(storeId) !== Number(user.store_id)) {
    const error = new Error('store_forbidden');
    error.status = 403;
    throw error;
  }
}

/** 项目级过滤条件（项目表别名默认 p）。 */
function projectFilter(user, alias = 'p') {
  if (isAdmin(user)) return { sql: '', params: [] };
  if (isStoreRole(user)) return { sql: `${alias}.store_id = ?`, params: [user.store_id] };
  if (isEngineer(user)) return { sql: `${alias}.surveyor_id = ?`, params: [user.id] };
  if (isCaptain(user)) return { sql: `${alias}.captain_user_id = ?`, params: [user.id] };
  return { sql: '1 = 0', params: [] };
}

function canAccessProject(user, project) {
  if (!user || !project) return false;
  if (isAdmin(user)) return true;
  if (isStoreRole(user)) return Number(project.store_id) === Number(user.store_id);
  if (isEngineer(user)) return Number(project.surveyor_id) === Number(user.id);
  if (isCaptain(user)) return Number(project.captain_user_id) === Number(user.id);
  return false;
}

function assertProject(user, project) {
  if (!canAccessProject(user, project)) {
    const error = new Error('project_forbidden');
    error.status = 403;
    error.details = {
      role: user && user.role, user_id: user && user.id,
      project_id: project && project.id, store_id: project && project.store_id,
      surveyor_id: project && project.surveyor_id, captain_user_id: project && project.captain_user_id,
    };
    throw error;
  }
}

module.exports = {
  STORE_ROLES, ENGINEER_ROLES,
  isAdmin, isStoreRole, isEngineer, isCaptain,
  storeFilter, assertStore, projectFilter, canAccessProject, assertProject,
};
