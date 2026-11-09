# 发布到生产环境的固定流程

> 当用户说「发布到生产环境」时，按本文流程执行，不要跳步。

## 0. 前置信息

- 生产服务器：`120.24.206.32`（阿里云，Alibaba Cloud Linux 3），SSH 用户 `trae`（密码由运维保存，**禁止写入本仓库**）
- 代码目录：`/opt/solar-setup`
- 服务：systemd `solar-setup`（Node/Express，监听 3000），nginx 80/443 反代
- 对外地址：`https://www.heitu.tech`（HTTP 自动 301 到 HTTPS，根路径 301 到 `/pv`）
- 仓库分支：日常开发 `dev`，发布分支 `main`

## 1. 本地自检（Windows，仓库根目录）

```powershell
npm start                     # 若本地服务未运行，先启动
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\smoke-test.ps1
```

要求 `RESULT pass=22 fail=0`。任何失败先修复再继续。

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
npm install --omit=dev --no-audit --no-fund
sudo systemctl restart solar-setup
sleep 4 && systemctl is-active solar-setup
```

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
curl -s -o /dev/null -w "root:%{http_code} %{redirect_url}\n" http://127.0.0.1/
curl -s -o /dev/null -w "pv:%{http_code}\n" http://127.0.0.1/pv
curl -s -o /dev/null -w "profile:%{http_code}\n" http://127.0.0.1/pv/member/profile
curl -s -o /dev/null -w "psh:%{http_code}\n" http://127.0.0.1/pv/data/pvgis-psh.json
curl -s http://127.0.0.1/pv/api/geo/countries | head -c 80    # 首两个应为 KH、CN
```

外网 HTTPS：

```powershell
curl.exe -s -o NUL -w "%{http_code}\n" https://www.heitu.tech/pv
curl.exe -s -o NUL -w "%{http_code}\n" https://www.heitu.tech/pv/member/profile
```

再用浏览器打开 `https://www.heitu.tech/pv`、`/pv/member`、`/pv/member/profile`，确认样式、Logo、语言国旗正常，控制台无 404 / CSP 报错。

## 6. 备注

- **静态资源必须用 `/pv/...` 绝对路径**：页面挂载在无尾斜杠的 `/pv`、`/pv/member` 等路由上，相对路径会被解析到上一级目录（曾导致生产首页完全无样式、国旗 404）。
- HTTPS 证书：Let's Encrypt，`/etc/letsencrypt/live/www.heitu.tech/`，nginx 配置 `/etc/nginx/conf.d/solar-setup.conf`（改动前先备份），续期由 `/etc/cron.d/certbot-renew` 每天 03:17 执行。
- 生产 nginx 的 CSP 目前为 `script-src 'self'`，会拦截 `accounts.google.com`，Google 登录在生产不可用。
- 修改 nginx 后必须 `sudo nginx -t` 再 `sudo systemctl reload nginx`。
