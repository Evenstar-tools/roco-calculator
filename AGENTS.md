# 洛克计算器项目协作规则

## 飞书安装包交付

以下规则在用户提出“发我飞书”“发送最新版安装包”“把桌面包发给我”等请求时强制执行。

1. **统一走飞书云盘。** 使用用户身份把安装包和校验文件上传到飞书云盘，再发送云盘链接；不得把本地文件直接作为即时消息附件发送。
2. **固定收件人是“晚星”。** 不得发送给“小虾”，也不得仅凭最近联系人猜测收件人。若“晚星”出现多个同名结果，先按历史会话和 open_id 核对；仍无法唯一确定时再询问用户。
3. **固定读取当前版本。** 从当前工作树的 `package.json` 读取版本号，安装包必须位于 `installers/v<版本号>/洛克计算器-<版本号>.exe`，并同时交付同目录的 `SHA256SUMS.txt`。
4. **上传前必须验证。** 确认测试、构建和桌面打包已经通过；重新计算安装包 SHA256，并与 `SHA256SUMS.txt` 逐字核对。版本号、文件名或哈希不一致时禁止发送。
5. **固定上传命令。** 在项目根目录执行：

   ```powershell
   lark-cli drive +upload --as user --file "./installers/v<版本号>/洛克计算器-<版本号>.exe" --name "洛克计算器-<版本号>.exe"
   lark-cli drive +upload --as user --file "./installers/v<版本号>/SHA256SUMS.txt" --name "洛克计算器-<版本号>-SHA256SUMS.txt"
   ```

   不传 `--folder-token`，默认上传到用户飞书云盘根目录，避免每次重新查找目录。
6. **上传后必须回读。** 使用 `lark-cli drive +search --as user --mine --doc-types file --only-title --query "洛克计算器-<版本号>"` 核对安装包和校验文件的名称、版本及可访问链接。上传命令成功但搜索不到文件，不算交付完成。
7. **只发送云盘链接。** 使用 `lark-cli contact +search-user --as user --query "晚星" --has-chatted` 解析收件人，再用 `lark-cli im +messages-send --as user --user-id <晚星 open_id> --markdown <消息正文>` 发送安装包和 SHA256 文件的云盘链接。消息中写明版本号、文件名和校验用途。
8. **消息必须读回。** 发送后用对应 P2P 会话的消息列表回读，确认收件人、中文、版本号和两个链接都正确。只有“云盘上传回读成功”和“消息读回成功”同时满足，才可汇报“已发飞书”。
9. **授权复用。** 默认复用 `C:\Users\Administrator\.lark-cli\` 的现有用户授权。只有上传或发送返回 token/scope 错误时，才运行 `lark-cli doctor`、`lark-cli auth status` 并按缺失的最小 scope 补授权；不得每次重新登录。

## 发布口径

- “已测试”不等于“已打包”，“已上传云盘”不等于“已发送给晚星”，三者必须分开记录。
- 工作树有未提交改动时，安装包必须由当前工作树重新构建；不得发送同版本目录中的旧包。
- 每次打包前先补齐 `CHANGELOG.md` 和 `src/data/user-release-notes.js`，再执行项目发布门禁。
