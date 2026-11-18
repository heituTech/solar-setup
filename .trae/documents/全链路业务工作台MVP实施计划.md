# 全系统前后端分离与全链路业务微服务重构实施计划

## Context

当前系统是 Node.js/Express + MySQL + 原生 HTML/JavaScript，已有首页、光伏配置器、会员 Case、报价快照、产品、账号、审批和多语言能力，但订单之后的业务尚不存在。用户要求把“客户线索 → 报价 → 订单 → 项目 → 设备 → 验收 → 回款 → 售后工单”跑通，并纳入销售业绩 Excel 模板中的订单台账、现场勘测、提成和月度薪酬结算。

最新架构决定覆盖旧计划中的“只新增内部工作台”方案：

- **整个项目全部重构**，不是只重做工作台。
- 前端统一为 **Vue 3 + Vite + Vue Router + Pinia + Element Plus**；现有公开页面、会员配置器、账号、后台、新工作台全部迁移。
- 后端统一为 **Egg.js 4 个独立领域服务**：identity、sales、delivery、finance。
- **每个服务独立 MySQL 数据库和独立账号**，禁止跨库 SQL、跨库外键和其他服务直接读写本服务表。
- 旧系统继续运行，新系统并行建设；功能、数据和回归全部完成后通过 Nginx **一次切换**，不长期双写、不逐页灰度。
- 用户提供 root 执行建库和授权脚本；密码只放服务器环境配置，不写入仓库。

已确认的业务规则不变：第一版新增能力以内部工作台为主；报价支持导入会员 Case 和手工明细；剩余 70% 提成必须“结清且已验收”；本人销售提成与 1% 转介绍奖互斥；销冠奖、其他奖励和扣款由会计手工登记。

## 一、现状与迁移依据

### 现有运行方式

- `server/index.js` 同时提供静态页面、`/pv/api/*` API 和 `/pv/skill/member/*`，监听 3000。
- `server/db.js` 默认连接 `solar_setup`，当前默认 root 账号；新环境改为每服务独立受限账号。
- `public/` 有 `home/tool/member/member-profile/account/admin` 6 个页面；新增 workbench 后由同一 Vue SPA 统一承载。
- `public/js/pricing-core.js` 是浏览器与 Node 均可加载的同步报价引擎；迁移计算逻辑，不重写公式。
- `public/js/i18n/all.js`、现有 shell/CSS、PSH 静态数据、Google 登录、AI 辅助入口均须保留能力。
- `DEPLOY.md` 当前生产为阿里云 `120.24.206.32`、`/opt/solar-setup`、systemd `solar-setup`、Nginx 80/443、`https://www.heitu.tech`，日常 `dev`、发布 `main`。

### 必须完整迁移的已有功能

1. 用户名/邮箱/国际手机号密码登录，手机号国家歧义处理。
2. 邮箱验证码注册和登录、会员/销售/销售主管注册及审批。
3. Google Identity Services 登录、自动建会员、邮箱验证检查。
4. 个人资料、修改手机号/邮箱验证码、修改密码。
5. 三类商品的公开/管理列表、新增、修改、删除、停售及销售审批。
6. 员工账号、上下级、审批列表、通过/驳回/取消和审批流配置。
7. 会员 Case 增删改查、负载清单、地址/经纬度、电价、配置器、报价快照和 catalog stale 提示。
8. 公开报价配置、国家/省/市联动、PSH 静态数据、会员技能 Markdown。
9. 现有 10 语言、响应式页眉、语言切换、会员和员工不同导航。

### 旧数据归属

- 迁至 identity：`users`、`sales_manager_links`、`approval_requests`、`approval_flows`、尚未使用且未过期的 `email_codes`。
- 迁至 sales：`inverters`、`solar_panels`、`batteries`、公开报价相关 `system_config`、`cases`。
- delivery、finance 的新业务表从空数据开始；旧库没有这些业务记录。
- 所有被迁移表的原有主键、时间戳、JSON、密码哈希和外键关系保持不变，尤其保留 `users.id → cases.member_id` 及审批中的用户/商品 ID。

## 二、目标目录与运行拓扑

采用 npm workspaces 单仓库，但 4 个服务分别构建、启动、测试和部署：

```text
apps/web/                         Vue 3 SPA
services/identity-service/        Egg.js，7101，solar_identity
services/sales-service/           Egg.js，7102，solar_sales
services/delivery-service/        Egg.js，7103，solar_delivery
services/finance-service/         Egg.js，7104，solar_finance
packages/pricing-core/            从现有报价引擎迁移的 ESM 模块及 parity fixtures
packages/service-kit/             仅通用技术设施：MySQL、迁移、鉴权客户端、HTTP、outbox/inbox
packages/contracts/               API 错误、事件名称、事件 payload 校验和 DTO 约定
database/root/                    root 建库、授权及可选测试库 SQL
database/legacy-migration/        旧库导出、迁移、增量迁移和校验脚本
scripts/                          本地编排、测试、部署和 smoke test
```

每个 Egg.js 服务保持独立结构：

```text
app/router.js
app/controller/
app/service/
app/middleware/
app/schedule/publish-outbox.js
config/config.default.js
config/config.prod.js
config/plugin.js
database/migrations/
test/
```

根 `package.json` 改为 workspaces，统一提供 `dev`、`build`、`test`、`test:unit`、`test:integration`、`test:e2e`、`migrate:*`、`start:*`，各服务仍有自己的 `package.json` 和锁定的生产依赖。开发时旧 Express 继续用 3000，新前端 Vite 用 5173，新服务用 7101–7104；生产 4 个服务仅监听 `127.0.0.1`，由 Nginx 统一同源暴露。

并行开发期间不改旧 `server/`、`public/` 行为；完成 parity 验证后，在切换提交中删除废弃 Express 路由和旧 HTML/JS 运行入口。需要保留的静态资源先迁至 `apps/web/public/`，会员技能 Markdown 迁至 sales 服务资源目录，旧版本通过 Git 标签保留用于回退，不在新运行时长期维护两套代码。

## 三、前端完整重构

### 1. 应用骨架

新增 `apps/web`：

- `src/main.js`：Vue、Router、Pinia、Element Plus、vue-i18n。
- `src/router/index.js`：以 `/pv/` 为 base 的 history 路由、登录和角色守卫。
- `src/stores/auth.js`、`locale.js`：同源 Bearer token、当前用户、语言和权限。
- `src/api/client.js`：统一请求、request ID、错误转换、401 登出；开发代理与生产 Nginx 使用同一路由表。
- `src/layouts/PublicLayout.vue`、`MemberLayout.vue`、`StaffLayout.vue`：替代旧 shell.js，页眉随按钮/语言换行自动增高。
- `src/components/`：国家电话、地区级联、商品选择、状态徽章、金额、时间线、确认对话框和 AI Dock。
- `src/styles/`：迁移现有设计 token 和品牌样式；Element Plus 只覆盖必要变量，不把旧 CSS 全量堆入组件。

生产由 Nginx 直接服务 `apps/web/dist`，`/pv` 和 `/pv/` 均返回 SPA，具名静态文件使用缓存，HTML 不缓存；所有 API location 必须优先于 SPA fallback。

### 2. 页面迁移

- `views/HomeView.vue`：现有首页和配置器入口。
- `views/ConfiguratorView.vue`：现有 `/pv/tool`，迁移负载编辑、PSH、系统模式、安装方式、产品比较、exact/recommended 和报价结果。
- `views/member/MemberCasesView.vue`、`MemberCaseEditor.vue`：My Cases、保存/恢复/删除 Case、catalog stale。
- `views/AccountView.vue`：资料、邮箱/手机号验证、密码修改。
- `views/admin/CatalogView.vue`：三类商品管理。
- `views/admin/UsersView.vue`、`ApprovalsView.vue`、`ApprovalFlowsView.vue`：账号、上下级、注册/商品审批和审批流。
- `views/admin/SettingsView.vue`：公开报价参数与财务薪酬参数分区，按角色显示，财务参数绝不进入公开 config。
- `views/admin/IntegrationHealthView.vue`：4 服务健康、失败 outbox/inbox、重试和 request ID，供总经理解耦运维。
- `views/workbench/`：客户、线索、勘测、报价、订单、项目设备、验收、回款、售后、订单台账、月度结算和客户 360。

公开页面继续使用轻量品牌组件，后台和工作台表单、表格、分页、弹窗、消息、日期和级联统一使用 Element Plus。新增工作台前端的角色按钮只是体验控制，所有服务仍逐接口鉴权。

### 3. 报价和兼容性

- 将 `public/js/pricing-core.js` 原逻辑迁至 `packages/pricing-core`，改为 Vue 可直接导入的 ESM；不调整 DOD、效率、串并联、数量、安装费、exact/recommended 等算法。
- 用迁移前 fixture 对比典型及边界输入的旧/新 JSON 结果，金额、数量、warning 和错误必须一致。
- `src/locales/` 迁移现有 10 语言全部 key，并新增角色、业务状态和薪酬词条；fallback 为英文。
- 保留 Google 脚本、国旗 CDN、PSH 数据和 `/pv/skill/member/*` 能力；更新 CSP 而非关闭安全策略。

## 四、4 个 Egg.js 领域服务

### 1. identity-service

**职责**：唯一用户、认证、岗位、上下级和通用审批所有者。

- 数据库 `solar_identity`：`users`、`sales_manager_links`、`approval_requests`、`approval_flows`、`email_codes`、`schema_migrations`、通用 `event_outbox/event_inbox`。
- `users.role` 扩展为 `super_admin/sales_manager/salesperson/electrical_engineer/structural_engineer/warehouse/accountant/after_sales/member`。
- 保留所有现有 auth、账号、审批和审批流 API；有业务记录的员工只能停用，不能物理删除。
- 使用 RS256 签发 JWT；私钥只在 identity，其他服务持公钥。保留现有 7 天登录体验，切换后旧 token 失效、用户用原密码重新登录。
- 提供内网 `POST /internal/auth/introspect`：返回 active 状态、角色、销售上下级和数据范围。其他服务先本地验签，再 introspect；按 token 缓存最多 30 秒，停用或改角色最迟 30 秒生效。
- 提供内网员工选项和数据范围查询；任何服务不得读取 identity 数据库。

**商品审批跨服务**：sales 创建商品审批时调用 identity 内网 API，identity 保存审批。审批通过时，账号类在 identity 本地事务执行；商品类由 identity 调用 sales 的幂等 `approval-apply`，sales 成功提交后 identity 才标记 approved。以 `approval_id` 唯一约束防止响应丢失或重试造成重复商品操作，失败保留 pending 并可重试。

### 2. sales-service

**职责**：商品目录、公开配置、地理/PSH、会员 Case、客户、线索、勘测、报价、订单主记录和客户 360 读模型。

- 数据库 `solar_sales`：三类商品表、`catalog_config`、`cases`、`customers`、`sales_leads`、`site_surveys`、`quotes`、`quote_items`、`orders`、`order_projections`、`customer_360_events`、`schema_migrations`、outbox/inbox。
- 保留现有 products/config/geo/cases/skill API；会员 Case 仍只能本人操作。
- 员工导入 Case 前验证客户归属和 `member_id`，优先 `exact`，否则 `recommended`；固化商品、数量、价格、安装费和原始 JSON。
- 报价金额由后端按明细重新计算；`draft → pending_review → approved → accepted → converted`，驳回回 draft，提交后锁定快照。
- 转订单在 sales 本地事务中锁报价、检查唯一订单、写订单和 `OrderConverted` outbox；不再宣称跨服务“同事务创建项目”。
- 消费 delivery/finance 事件维护订单回款/交付投影和客户时间线，前端客户 360 只查询 sales，不在浏览器拼接无序记录。

### 3. delivery-service

**职责**：订单交付快照、项目、设备、安装、双专业审核、最终验收和售后工单。

- 数据库 `solar_delivery`：`delivery_orders`、`projects`、`project_devices`、`service_tickets`、`delivery_events`、`schema_migrations`、outbox/inbox。
- 消费 `OrderConverted`，以 `event_id` 和 `order_id` 唯一约束幂等创建项目及设备台账。
- 项目只有分配电气和结构工程师才能启动；设备全部 delivered + installed、双专业审核齐全后才能验收。
- 验收后写本地事务和 `ProjectAccepted` 事件；sales 更新订单/客户时间线，finance 解锁剩余 70% 提成条件。
- 仅已验收项目可创建工单；设备必须属于该项目；无处理结果不能解决，只有售后或总经理可关闭。

### 4. finance-service

**职责**：订单财务快照、多笔回款/退款、订单台账、提成、实发、奖惩和月度薪酬。

- 数据库 `solar_finance`：`finance_orders`、`payments`、`commission_payouts`、`sales_adjustments`、`sales_settlements`、`compensation_config`、`survey_credit_projection`、`schema_migrations`、outbox/inbox。
- 消费 `OrderConverted` 固化客户、销售、合同金额、币种、USD 业绩基数、奖励方式；消费 `ProjectAccepted` 保存验收日期；消费 `SurveyReviewed` 统计有效勘测。
- 支付事务锁 `finance_orders`，以 SQL `DECIMAL` 汇总有效净回款，拒绝异币种、非正数和超额回款；作废纠错，不物理删除。
- 创建支付、退款、提成实发和手工调整必须带客户端 `request_id`，数据库唯一约束防双击和重试重复入账。
- 发布 `PaymentChanged`、`PayoutChanged`、`SettlementChanged` 供 sales 更新订单投影及客户 360。
- 薪酬配置仅 finance 可读写；会计和总经理可维护，公开 config 白名单绝不包含这些键。

## 五、服务间一致性设计

首版不增加 RabbitMQ、Redis 或分布式事务中间件，使用 **本地事务 + MySQL outbox + HTTP 内网事件 + inbox 幂等**：

1. 每个业务写操作与 outbox 在同一数据库事务提交；每个事件有 UUID `event_id`、类型、aggregate/customer ID、payload、actor、request ID 和时间。
2. 每个接收方有独立 outbox 目的地行，Egg schedule 每 2 秒扫描待发送记录，接收方只有在 inbox + 本地投影事务提交后才返回成功。
3. inbox 对 `event_id` 唯一约束，事件为 at-least-once，消费者必须幂等；重复事件直接返回成功。
4. 发送失败按退避重试，超过阈值标记 failed 并在管理端显示，不静默丢弃；支持管理员手动重试。
5. 内网事件和审批接口使用独立服务凭据、时间戳签名，仅允许服务器内网/本机访问，Nginx 不公开 `/internal/*`。
6. 所有 HTTP 调用传递 `X-Request-ID`，Egg 日志包含服务、请求、事件、操作人和业务 ID。

关键事件：

- identity：`UserChanged`，供其他服务更新人员显示快照；权限仍以 introspect 为准。
- sales：`OrderConverted` → delivery、finance；`SurveyReviewed` → finance；客户变更同步必要的显示快照。
- delivery：`ProjectAccepted`、`ProjectProgressChanged`、`TicketChanged` → sales；`ProjectAccepted` → finance。
- finance：`PaymentChanged`、`PayoutChanged`、`SettlementChanged` → sales。

转订单接口在本地提交后返回 201，并显示“项目初始化中”；delivery 消费完成后变为“待分配”。delivery 暂时不可用时订单和 outbox 不丢，恢复后只创建一个项目；界面不得把事件未完成的订单显示为已可验收。

## 六、角色和业务规则

| 角色 | 数据范围与职责 |
|---|---|
| `super_admin` 总经理 | 全公司、全部操作、账号、审批流、薪酬参数、失败事件和受控重开 |
| `sales_manager` 销售主管 | 自己及下属；报价审核、勘测有效性、项目分配、最终验收、下属业绩 |
| `salesperson` 销售/店员 | 自己客户；线索、勘测、报价、转订单、本人业绩、发起售后 |
| `electrical_engineer` 电气工程师 | 被分配项目；设备安装调试、电气审核、分配工单 |
| `structural_engineer` 结构工程师 | 被分配项目；设备安装、结构审核、分配工单 |
| `warehouse` 仓库管理员 | 已确认订单项目；设备序列号和交付，不可查看财务 |
| `accountant` 会计 | 全部订单财务；回款退款、提成实发、手工奖惩、月度结算 |
| `after_sales` 售后专员 | 已验收项目；创建、分配、处理、关闭工单 |
| `member` 外部会员 | 现有 Case 和配置器，禁止进入内部工作台 |

沿用“一账号一个主岗位”和 `sales_manager_links` 数据范围。缺岗由总经理代办，不增加多岗位权限矩阵。

首版限定一条线索最多成交一次、一个报价最多一个订单、一个订单一个项目、一次性整体验收。订单必须选择本人销售提成或转介绍奖励：

- 合同 USD 业绩基数 `<1500` 为零售、费率 8%；`1500–5000` 为工程、费率 4%；`>5000 且 <=15000` 为 5%；`>15000` 为 6%。
- 默认底薪 300 USD、首单奖 20 USD、转介绍奖按实际净回款 1%、当月有效勘测不少于 15 次勤奋奖 50 USD。
- 本人提成首次达到合同业绩基数 50% 时产生总提成 30%，归实际到账月份；达到 100% 且最终验收后产生 70%，归结清与验收较晚月份。
- KHR 订单由会计确认 USD 业绩基数和依据，首版不自动换算汇率。
- 本人提成和转介绍奖只取其一；退款按净回款重算，已发超出部分显示“应追回”，不静默冲销。
- 月度结算保存底薪、两阶段提成、首单/转介绍/勤奋奖、手工奖励、扣款、已发、待发/追回和签字快照；仅总经理可重开并留痕。

订单台账按 Excel 25 列业务含义展示，但金额和状态来自 sales/delivery/finance 的真实投影，支持多笔回款，不再维护定金/尾款两个孤立手工格。

## 七、API 与 Nginx 路由归属

保留现有公开 URL 和响应结构，降低前端以外调用方的兼容风险；新增工作台继续使用 `/pv/api/workbench/*`：

| 路径 | 服务 |
|---|---|
| `/pv/api/auth/*`、`/pv/api/admin/users/*`、`/pv/api/approvals/*`、`/pv/api/admin/flows/*` | identity |
| `/pv/api/products/*`、`/pv/api/config/*`、`/pv/api/geo/*`、`/pv/api/cases/*`、`/pv/skill/member/*` | sales |
| `/pv/api/workbench/customers|leads|surveys|quotes|orders-from-quote|customer-360/*` | sales |
| `/pv/api/workbench/projects/*`、`/pv/api/workbench/tickets/*` | delivery |
| `/pv/api/workbench/orders/ledger|payments|performance|commission-payouts|sales-adjustments|settlements/*` | finance |

另为每服务提供统一命名的健康和事件运维入口，只有 super_admin 可查看失败事件或重试；基础 health 只暴露状态，不泄露 SQL、环境变量和内部地址。

生产 Nginx 按上表反代到 7101–7104，设置 body 大小、超时、真实 IP、request ID 和现有 HTTPS/CSP；SPA 静态路径最后匹配。Vite dev proxy 复用同一份路径常量，避免开发和生产路由漂移。

## 八、数据库脚本与旧数据迁移

### 1. root 脚本

新增：

- `database/root/001_create_service_databases.sql`：创建 `solar_identity/sales/delivery/finance`，utf8mb4。
- `database/root/002_create_service_users.sql`：创建 4 个独立 localhost 账号，密码使用醒目的待替换占位符；每个账号只拥有本库的 DML 和迁移所需 DDL，无其他库及全局权限。
- `database/root/003_create_test_databases.sql`：仅开发/测试需要时执行，创建对应 `_test` 数据库并授权。

实际密码由用户执行前替换或通过本地安全变量生成，仓库、日志和计划均不保存真实密码。应用 `.env.example` 只列变量名。

### 2. 服务迁移

每服务使用自己的 `schema_migrations` 和顺序 SQL 文件，迁移器记录 checksum，已执行文件不重复运行，checksum 变化立即停止。迁移脚本默认拒绝非 `_test` 的自动破坏性操作；生产 DDL 先备份再执行。

### 3. 旧库迁移工具

- `inspect-legacy.js`：只读检查 MySQL 版本、表结构、行数、NULL/重复和最新 Case 字段。
- `migrate-legacy.js`：支持 `--dry-run`、按表批次和 `--final-delta`；identity → sales 顺序迁移，保留显式 ID。
- `verify-migration.js`：逐表比较行数、主键集合和规范化内容 hash；对 users 的密码哈希只比较、不输出；检查 Case 的 member ID、商品审批目标 ID、报价 JSON 和时间。
- `report-migration.js`：输出通过/失败及差异 ID，不把差异报告当成功。

并行阶段可多次 dry-run；正式切换时暂停旧系统写入，执行最终增量迁移。旧 `solar_setup` 不删除、不双写，完整备份保留。

## 九、实施顺序

1. **工程骨架**：workspaces、4 个 Egg 服务、Vue SPA、环境模板、root SQL、通用迁移/鉴权/request ID 和健康检查。
2. **identity parity**：迁移认证、账号、上下级、审批和审批流；扩展新角色，完成原登录/注册/Google/资料行为测试。
3. **sales parity**：迁移商品、配置、地理、PSH、技能、Case 和配置器；完成 pricing-core fixture 对比与商品跨服务审批。
4. **销售主链路**：客户、线索、勘测、手工/Case 报价、审核、接受、转订单和 outbox。
5. **delivery**：消费订单事件、项目设备、分配、交付安装、双审、验收和工单事件。
6. **finance**：消费订单/验收/勘测事件、回款退款、订单台账、提成、实发、奖惩和月结。
7. **工作台与客户 360**：完成 8 类内部岗位页面、投影、时间线、异常事件管理和 10 语言。
8. **全站收尾**：迁移全部旧页面和资源，更新根脚本、现有 `DEPLOY.md` 和 smoke test；parity 通过后移除旧运行入口。
9. **迁移演练与发布**：在 `_test`/预生产四库做全量迁移和故障恢复，再备份生产并一次切换。

每一步先完成服务测试再进入下一步，不把全部问题留到最终联调。

## 十、验证方案

### 单元与服务测试

- pricing-core 旧/新 fixture 完全一致，含无电池、并机、MPPT、边界数量和两种币种。
- identity 覆盖所有旧认证、手机歧义、验证码、Google、审批权限和新角色。
- 每服务使用独立 `_test` 数据库；未登录 401、无权限 403、销售越权、工程师/仓库越权均被拒绝。
- 报价服务端金额、Case 快照、自审、非法状态、重复/并发转单。
- 设备未交付安装、缺双审验收、未验收建工单、跨项目设备、无结果解决均被拒绝。
- 多笔回款、超额/异币种、作废恢复、request_id 重复、提成档位、50% 节点、结清未验收不发 70%、验收后补发、互斥奖励、首单、15 次勘测、追回和月结快照。

### 微服务集成与故障测试

- 四真实测试库启动四服务，最终客户 360 能找到全链路实体、金额、操作人、事件和 request ID。
- delivery 停止时转订单，outbox 保留；恢复后自动且只创建一个项目。
- 重复 `OrderConverted/ProjectAccepted/PaymentChanged` 不产生重复项目、提成或时间线。
- 商品审批 apply 成功但响应丢失时重试仍只执行一次。
- finance/delivery 暂时不可用有明确错误和初始化状态，不破坏已提交数据。
- identity 不可用时不默认放行；服务密钥错误、跨服务直接数据库连接均失败。

### 前端与回归

- Vitest 覆盖认证守卫、金额、状态、表单和报价组件；Playwright 覆盖会员及 8 类内部角色。
- 浏览器走完整业务链，检查刷新持久化、角色按钮、事件最终状态、控制台无错误、移动布局和中/英/高棉语；其余语言做页面遍历。
- 保留现有 22 项 smoke 检查的等价能力并新增 4 服务健康、Vue 静态资源、全链路和财务检查，不为了凑数保留失效断言。

## 十一、生产切换与回退

1. 本地全量测试、前端构建、迁移 dry-run 和报告全部通过；按 `DEPLOY.md` 提交 `dev`、合并 `main`。
2. 备份旧代码和 `solar_setup`，打 `pre-vue-egg-cutover` 标签；root 执行建库授权，服务器安全配置 4 份 env 和 JWT 密钥。
3. 安装各服务生产依赖、运行四库迁移、构建 Vue；配置并启动 `solar-identity/sales/delivery/finance` 4 个 systemd unit，旧 `solar-setup` 暂不停。
4. 先通过内网端口和临时 Nginx 主机做 smoke；进入维护窗口后停止旧服务写入，执行最终增量迁移和校验。
5. 备份并切换 Nginx 到 SPA + 4 服务，`nginx -t` 通过后 reload；检查本机和公网 HTTPS、登录、会员 Case、报价、工作台、财务和静态资源。
6. 对外开放前若失败，可切回旧 Nginx、旧 systemd 和旧库；开放后不双写，优先 roll-forward。若必须回退，先进入维护并导出新库业务增量，不能直接覆盖或丢弃新记录。
7. 切换后旧用户密码和资料不变，但旧 JWT 失效，需要重新登录；确认稳定后再停止/禁用旧 unit，旧数据库备份继续保留。

## 十二、仍不纳入首版的业务范围

- 客户在线项目进度、在线验收、电子签名、在线支付/退款。
- 采购、真实库存扣减、调拨、成本、供应商、发票、税务、总账和完整 HRMS。
- 一报价多订单、一订单多项目、部分验收和订单变更。
- 可配置多级业务审批、SLA 催办、文件上传、PDF、自动消息和自动汇率。

这些业务边界不因技术架构重构而扩大；本次额外完成的是现有全站迁移、服务治理、数据迁移和可回退发布所必需的工程能力。
