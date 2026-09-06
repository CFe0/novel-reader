# 局域网书库（本机共享，不公开）

把 TXT 小说放进**本文件夹**，然后运行：

```bash
npm run lan
```

电脑会启动一个本地服务并打印访问地址。手机/平板连上**同一个 Wi-Fi/网络**后，用浏览器打开：

```text
http://<电脑局域网IP>:8612/
```

即可像在线阅读一样阅读本文件夹里的小说。

- 本文件夹的书**不会**上传到 GitHub，也不对公网公开（仅同一局域网可见）；
- `npm run lan` 会自动执行构建；
- 也可以用项目根目录的 **`启动局域网书库.bat`**（双击运行，自动安装依赖并启动）。

## 防火墙放行 8612 端口

- 首次启动时 Windows 会弹出防火墙询问：请勾选“**专用网络**”后点“允许访问”；
- 如果当时没允许：开始菜单搜索“防火墙”→“允许应用通过防火墙”→更改设置→“允许其他应用”→选择 Node.js（通常在 `C:\Program Files\nodejs\node.exe`），并勾选“专用”；
- 或者用**管理员** PowerShell 运行：
  ```powershell
  netsh advfirewall firewall add rule name="NovelReader LAN 8612" dir=in action=allow protocol=TCP localport=8612
  ```

## 迁移到新电脑（如笔记本）

1. 新电脑安装 **Node.js LTS**：https://nodejs.org （装完重启终端）；
2. 把整个项目文件夹拷贝过去（或从 GitHub 克隆公开部分）；
3. 双击运行 `启动局域网书库.bat`（会自动 `npm install` 并启动），或手动执行 `npm install && npm run lan`；
4. 手机连同一 Wi-Fi，访问打印出的 `http://<新电脑IP>:8612/`。

> 注意：`局域网书库/` 里的私密书不会进 GitHub，迁移时要随文件夹一起拷贝。
