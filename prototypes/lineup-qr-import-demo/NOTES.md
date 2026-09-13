# 阵容二维码本地识别 Demo

这是一次性功能原型，用来回答：配队图里的二维码能否在本机可靠定位、解码，并复用计算器现有阵容协议生成导入预览和导出内容。

## 边界

- 图片只发送到 `127.0.0.1` 的本地 Flask 进程，不写入磁盘。
- ZXing-C++ 只读取二维码；不做 OCR，不根据卡片文字补齐解码结果。
- 普通网址、短链接和未知文本只展示原始载荷，不自动访问，也不映射阵容字段。
- 阵容解析和重新导出直接调用项目的 `src/state/lineup-code.js`、当前快照与映射表。
- 原型验证完成后，应把识别服务和 UI 流程吸收到正式应用，再删除本目录。

## 启动

```powershell
powershell -ExecutionPolicy Bypass -File .\prototypes\lineup-qr-import-demo\run.ps1
```

浏览器打开 <http://127.0.0.1:5178>。

## 测试

```powershell
powershell -ExecutionPolicy Bypass -File .\prototypes\lineup-qr-import-demo\test.ps1
```
