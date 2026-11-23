# 发布到生产环境的固定流程

> 当用户说「发布到生产环境」时，按本文流程执行，不要跳步。

## 0. 前置信息

- 生产服务器：`120.24.206.32`（阿里云，Alibaba Cloud Linux 3），SSH 用户 `trae`（密码由运维保存，**禁止写入本仓库**）
- 代码目录：`/opt/solar-setup`
- 服务：`solar-gateway`(7100) 作为统一 API 入口，按 `services/gateway-service/routes.js` 的前缀表转发到五个微服务 `solar-identity`(7101)、`solar-sales`(7102)、`solar-delivery`(7103)、`solar-finance`(7104)、`solar-hrms`(7105)；前端静态资源由 nginx 从 `apps/web/dist` 提供
- 对外地址：`https://www.heitu.tech`（HTTP 自动 301 到 HTTPS，根路径 301 到 `/pv`）
- 仓库分支：日常开发 `dev`，发布分支 `main`

## 1. 本地自检（Windows，仓库根目录）

```powershell
npm test --workspace @solar/sales-service   # 核心业务单测
npm test                                    # 可选：全 workspace
npm run build                               # 前端构建
```

- 必过：`@solar/sales-service` 单测全绿（当前 56 项）。
- `npm test` 是全 workspace 遍历，`@solar/web` 没有测试文件，会以 `No test files found` 让整体退出码为 1；这是预期行为，看各服务自己的 `pass/fail` 汇总即可。
- `npm run build` 必须成功。
- `scripts/smoke-test.ps1` 校验的是服务器上未入库的 `public/`、`server/` 老站，本地仓库不具备这些文件，已不再作为自检步骤。

## 2. 提交并推送 dev

```powershell
git status --short
git add <改动的文件>
git commit -m "<类型>: <改动说明>"
git push origin dev
```

## 3. GitHub 上 main 从 dev 合并

```powershell
git checkout main
git pull origin main
git merge dev -m "chore: 合并 dev 分支（<改动说明>）"
git push origin main
git checkout dev
```

## 4. 生产从 GitHub main 拉取、编译、重启

通过 SSH 在服务器执行（推荐用本地 Node + ssh2 脚本批量执行，见 `C:\Users\minca\AppData\Local\Temp\ssh-deploy-main*.js` 模板）：

```bash
cd /opt/solar-setup
git fetch origin main
git checkout -f -B main origin/main
git log --oneline -1                     # 确认 HEAD 与 GitHub main 一致

npm install --no-audit --no-fund         # 不要加 --omit=dev：构建需要 vite

npm run migrate:identity                 # 新迁移自动应用，已应用的自动跳过
npm run migrate:sales
npm run migrate:delivery
npm run migrate:finance
npm run migrate:hrms

npm run build                            # 前端必须在服务器构建，产物写入 apps/web/dist

sudo systemctl restart solar-identity solar-sales solar-delivery solar-finance solar-hrms solar-gateway
sleep 6 && systemctl is-active solar-identity solar-sales solar-delivery solar-finance solar-hrms solar-gateway
```

迁移机制：`packages/service-kit/migrate.js` 按文件名排序执行，执行记录写在各自库的 `schema_migrations`（含 sha256 校验）。重复执行安全；若迁移文件内容被改动会报 `Migration checksum changed` 并中止，此时不要强行改库，先确认文件是否被误改。

若服务器直连 GitHub 失败（历史上有过 `Empty reply`），兜底方案：

```powershell
git bundle create ..\solar-main.bundle <旧提交>..main
# SFTP 上传到 /tmp 后，在服务器执行：
cd /opt/solar-setup
git fetch /tmp/solar-main.bundle main
git checkout -f -B main FETCH_HEAD
```

## 5. 部署后验证（必须全部通过）

服务器本机：

```bash
for p in 7101 7102 7103 7104 7105; do printf "port$p:"; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:$p/health; done
curl -sL -o /dev/null -w "pv:%{http_code}\n" https://www.heitu.tech/pv          # 200
curl -sL -o /dev/null -w "login:%{http_code}\n" https://www.heitu.tech/pv/login # 200
curl -s -o /dev/null -w "notifications:%{http_code}\n" https://www.heitu.tech/pv/api/notifications   # 401 = 路由已通
curl -s http://127.0.0.1/pv/api/geo/countries | head -c 80    # 首两个应为 KH、CN
```

五个端口全部 `200`，页面 `200`，受保护接口返回 `401` 即正常（401 说明请求已打到对应微服务、被鉴权拦下；`404` 说明 nginx 路由缺失，`502` 说明服务未启动）。

外网 HTTPS：

```powershell
curl.exe -s -o NUL -w "%{http_code}\n" https://www.heitu.tech/pv
curl.exe -s -o NUL -w "%{http_code}\n" https://www.heitu.tech/pv/member/profile
```

再用浏览器打开 `https://www.heitu.tech/pv`、`/pv/member`、`/pv/member/profile`，确认样式、Logo、语言国旗正常，控制台无 404 / CSP 报错。

## 6. 备注

- **新增 API 前缀只改网关路由表**：编辑 `services/gateway-service/routes.js` 的 `TABLE` 即可，不需要动 nginx。nginx 里只有一条 `location /pv/api/ { proxy_pass http://127.0.0.1:7100; ... }`。只有新增微服务或调整端口时，才需要动 nginx 与 systemd 单元。
- **nginx 与网关分工**：nginx 负责 TLS 终止、静态资源（`apps/web/dist`）、`/pv/skill` 直连 sales；网关负责 `/pv/api/` 前缀分发、透传 `x-request-id`、上游故障返回 502/504、输出一行 JSON 访问日志。鉴权仍由各服务用 `@solar/service-kit` 完成（JWT 验签 + identity 用户状态校验），网关不做拦截。
- **新增迁移文件必须同步第 4 步**：在 `services/<svc>/database/migrations/` 下加 SQL 后，要把对应的 `npm run migrate:<svc>` 写进部署步骤，否则线上表结构会缺列。
- `services/hrms-service/.env` 的 `DB_NAME` 目前是 `solar_finance`（与 finance 共用库），所以 `npm run migrate:hrms` 日志显示 `[solar_finance]`，属当前预期配置。
- **静态资源必须用 `/pv/...` 绝对路径**：页面挂载在无尾斜杠的 `/pv`、`/pv/member` 等路由上，相对路径会被解析到上一级目录（曾导致生产首页完全无样式、国旗 404）。
- HTTPS 证书：Let's Encrypt，`/etc/letsencrypt/live/www.heitu.tech/`，nginx 配置 `/etc/nginx/conf.d/solar-setup.conf`（改动前先备份）。
- 证书续期：脚本 [`scripts/renew-cert.sh`](scripts/renew-cert.sh) 部署到服务器 `/usr/local/bin/renew-heitu-cert.sh`，由 `/etc/cron.d/certbot-renew` 每天 03:17 执行；手动验证用 `--test`（强制重新签发，会消耗一次重复证书额度）。更新脚本后需重新上传并 `sudo install -m 755` 到 `/usr/local/bin/`。
- 生产 nginx 的 CSP 已放行 `accounts.google.com`（Google 第三方登录）与 `flagcdn.com`（手机号国家旗帜）；改动 CSP 后同样需要 `nginx -t` + reload。
- 修改 nginx 后必须 `sudo nginx -t` 再 `sudo systemctl reload nginx`。
