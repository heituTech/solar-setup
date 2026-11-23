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
curl -s -o /dev/null -w "gateway:%{http_code}\n" http://127.0.0.1:7100/pv/api/health   # 200，网关直连
curl -sL -o /dev/null -w "pv:%{http_code}\n" https://www.heitu.tech/pv          # 200
curl -sL -o /dev/null -w "login:%{http_code}\n" https://www.heitu.tech/pv/login # 200
curl -s -o /dev/null -w "notifications:%{http_code}\n" https://www.heitu.tech/pv/api/notifications   # 401 = 网关链路已通
```

五个端口全部 `200`，网关直连 `200`，页面 `200`，受保护接口返回 `401` 即正常。经网关访问时：`401` 说明请求已到达对应微服务、被鉴权拦下；`404` 且响应体是 `{"error":"route_not_found"}` 说明网关路由表缺条目；`502` 说明上游服务未启动；`504` 说明上游超时。

外网 HTTPS：

```powershell
curl.exe -s -o NUL -w "%{http_code}\n" https://www.heitu.tech/pv
curl.exe -s -o NUL -w "%{http_code}\n" https://www.heitu.tech/pv/member/profile
```

再用浏览器打开 `https://www.heitu.tech/pv`、`/pv/member`、`/pv/member/profile`，确认样式、Logo、语言国旗正常，控制台无 404 / CSP 报错。

## 6. API 网关（solar-gateway）

### 6.1 拓扑

```
浏览器 ──https──> nginx(443)
                   ├─ /pv/api/*  ──> solar-gateway(127.0.0.1:7100) ──前缀表──> identity 7101
                   │                                                         sales    7102
                   │                                                         delivery 7103
                   │                                                         finance  7104
                   │                                                         hrms     7105
                   ├─ /pv/skill  ──> sales 7102（直连，不经网关）
                   └─ 其余 /pv/*  ──> apps/web/dist 静态资源
```

### 6.2 代码与运行

| 文件 | 作用 |
|---|---|
| `services/gateway-service/index.js` | 基于 `node:http` 的转发进程，零第三方依赖：透传请求/响应、补 `x-request-id`、超时 504 / 连接失败 502、每请求一行 JSON 日志 |
| `services/gateway-service/routes.js` | **唯一路由表** `TABLE`，前缀 → 服务，最长前缀优先（`/pv/api/workbench/directory` 先于 `/pv/api/workbench`） |

启动命令：`npm run start:gateway`（等价于 `node services/gateway-service/index.js`）。

环境变量全部有默认值，正常部署无需 `.env`：

| 变量 | 默认值 |
|---|---|
| `PORT` | `7100` |
| `BIND_HOST` | `127.0.0.1` |
| `UPSTREAM_TIMEOUT_MS` | `60000` |
| `IDENTITY_URL` / `SALES_URL` / `DELIVERY_URL` / `FINANCE_URL` / `HRMS_URL` | `http://127.0.0.1:7101` ~ `7105` |

### 6.3 systemd 单元

`/etc/systemd/system/solar-gateway.service`：

```ini
[Unit]
Description=Solar API Gateway
After=network.target

[Service]
Type=simple
User=trae
Group=trae
WorkingDirectory=/opt/solar-setup
Environment=NODE_ENV=production
ExecStart=/usr/bin/node services/gateway-service/index.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

首次安装：

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now solar-gateway
systemctl is-active solar-gateway
```

日志：`sudo journalctl -u solar-gateway -f --no-pager`（普通用户不在 `systemd-journal` 组时看不到，必须加 `sudo`）。每条访问日志形如：

```json
{"level":"info","requestId":"...","method":"GET","url":"/pv/api/health","service":"identity","status":200,"ms":3}
```

### 6.4 nginx 侧

两个 server 块（80 与 443）各一条 location，其余 `/pv/api/*` 的 location 已全部删除：

```nginx
location /pv/api/ {
    limit_req zone=solar_api burst=60 nodelay;
    proxy_pass http://127.0.0.1:7100;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
}
```

### 6.5 新增接口 / 新增服务

- **新增接口前缀**：只改 `routes.js` 的 `TABLE`，新增一行 `['/pv/api/xxx', 'sales']`，重启 `solar-gateway` 即可，**不需要动 nginx**。
- **新增微服务**：`TABLE` 加映射 + `UPSTREAMS` 加地址 + 新建对应 systemd 单元 + 把单元名加入第 4 步的重启列表。nginx 仍然不用改。
- **匹配规则**：前缀按长度倒序匹配，`path === prefix` 或 `path.startsWith(prefix + '/')`；不使用正则。

### 6.6 排错对照

| 现象 | 含义 |
|---|---|
| `404 {"error":"route_not_found"}` | 网关路由表无匹配前缀，去改 `routes.js` |
| `404` 但响应体是业务错误（如 `{"error":"..."}`） | 网关转发成功，上游服务自身返回 404 |
| `502 {"error":"bad_gateway"}` | 上游未启动或端口配错，先查对应 `solar-*` 单元 |
| `504 {"error":"gateway_timeout"}` | 上游超过 `UPSTREAM_TIMEOUT_MS` 未响应 |
| 响应头带 `x-request-id` | 网关注入的请求 id，可用它 grep journal 日志定位整条链路 |

### 6.7 回滚到改造前的 nginx

改造前的配置以备份形式保留（`/etc/nginx/conf.d/solar-setup.conf.bak.*`）：

```bash
sudo cp /etc/nginx/conf.d/solar-setup.conf.bak.<时间戳> /etc/nginx/conf.d/solar-setup.conf
sudo nginx -t && sudo systemctl reload nginx
```

回滚后 `/pv/api/*` 恢复为直连各微服务，网关可保留运行但不被调用。

## 7. 备注

- **两个“历史遗留 404”**：`/pv/api/hrms/health` 不存在（hrms 只注册了 `/health` 与 `/pv/api/health`）；`/pv/api/geo/countries` 也不存在（sales 的 `misc.geo` 只注册 `/pv/api/geo`）。两者都与网关无关，不要用它们判断网关是否正常，验证网关请用 `/pv/api/health`。
- **新增迁移文件必须同步第 4 步**：在 `services/<svc>/database/migrations/` 下加 SQL 后，要把对应的 `npm run migrate:<svc>` 写进部署步骤，否则线上表结构会缺列。
- `services/hrms-service/.env` 的 `DB_NAME` 目前是 `solar_finance`（与 finance 共用库），所以 `npm run migrate:hrms` 日志显示 `[solar_finance]`，属当前预期配置。
- **静态资源必须用 `/pv/...` 绝对路径**：页面挂载在无尾斜杠的 `/pv`、`/pv/member` 等路由上，相对路径会被解析到上一级目录（曾导致生产首页完全无样式、国旗 404）。
- HTTPS 证书：Let's Encrypt，`/etc/letsencrypt/live/www.heitu.tech/`，nginx 配置 `/etc/nginx/conf.d/solar-setup.conf`（改动前先备份）。
- 证书续期：脚本 [`scripts/renew-cert.sh`](scripts/renew-cert.sh) 部署到服务器 `/usr/local/bin/renew-heitu-cert.sh`，由 `/etc/cron.d/certbot-renew` 每天 03:17 执行；手动验证用 `--test`（强制重新签发，会消耗一次重复证书额度）。更新脚本后需重新上传并 `sudo install -m 755` 到 `/usr/local/bin/`。
- 生产 nginx 的 CSP 已放行 `accounts.google.com`（Google 第三方登录）与 `flagcdn.com`（手机号国家旗帜）；改动 CSP 后同样需要 `nginx -t` + reload。
- 修改 nginx 后必须 `sudo nginx -t` 再 `sudo systemctl reload nginx`。
