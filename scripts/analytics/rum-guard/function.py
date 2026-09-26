"""RUM 每日用量保护：SCF 每分钟调用，默认仅演练，不恢复上报。"""
import json
import os
from datetime import datetime, timezone, timedelta

PROJECT_ID = 159589
REGION = "ap-guangzhou"
REGIONS = ("ap-guangzhou", "ap-singapore", "na-siliconvalley")
LIMIT = 400_000
TZ = timezone(timedelta(hours=8))


def parse_count(result):
    data = json.loads(result)
    rows = data.get("results")
    if not isinstance(rows, list) or not rows:
        raise ValueError("missing results")
    total = 0
    for statement in rows:
        if statement.get("error"):
            raise ValueError("query error")
        series = statement.get("series")
        if not isinstance(series, list) or not series:
            raise ValueError("missing series")
        for item in series:
            columns = item.get("columns", [])
            if columns.count("allCount") != 1 or not isinstance(item.get("values"), list):
                raise ValueError("unknown count schema")
            index = columns.index("allCount")
            for row in item["values"]:
                value = row[index]
                if isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0 or int(value) != value:
                    raise ValueError("invalid count")
                total += int(value)
    return total


def protect(api, now, apply=False, allow_resume=False):
    local = now.astimezone(TZ)
    start = int(local.replace(hour=0, minute=0, second=0, microsecond=0).timestamp())
    end = int(now.timestamp())
    totals = {}
    try:
        # 不传 ID/InstanceID，读取各地域主账号总量，避免只看本站漏掉共享免费额度。
        for region in REGIONS:
            response = api(region, "DescribeDataReportCountV2", {"StartTime": start, "EndTime": end})
            totals[region] = parse_count(response["Result"])
        total = sum(totals.values())
    except Exception:
        if apply:
            api(REGION, "StopProject", {"ProjectId": PROJECT_ID})
        # 不打印异常正文，避免凭据或请求签名进入日志。
        return {"status": "query_failed_stopped" if apply else "query_failed_dry_run", "day": local.date().isoformat()}
    if total >= LIMIT:
        action = "StopProject"
    elif allow_resume and local.hour == 0 and 5 <= local.minute < 10:
        # 每天只在重置窗口恢复，避免日内故障后自动反复开关。
        action = "ResumeProject"
    else:
        action = None
    if apply and action:
        api(REGION, action, {"ProjectId": PROJECT_ID})
    return {"status": action or "below_limit", "applied": bool(apply and action), "day": local.date().isoformat(), "total": total, "regions": totals, "limit": LIMIT}


def cloud_api(region, action, parameters):
    from tencentcloud.common import credential
    from tencentcloud.common.profile.client_profile import ClientProfile
    from tencentcloud.common.profile.http_profile import HttpProfile
    from tencentcloud.rum.v20210622 import rum_client, models
    creds = credential.Credential(os.environ["TENCENTCLOUD_SECRETID"], os.environ["TENCENTCLOUD_SECRETKEY"], os.environ.get("TENCENTCLOUD_SESSIONTOKEN"))
    profile = ClientProfile(httpProfile=HttpProfile(endpoint="rum.tencentcloudapi.com", reqTimeout=8))
    client = rum_client.RumClient(creds, region, profile)
    request = getattr(models, action + "Request")()
    request.from_json_string(json.dumps(parameters))
    return json.loads(getattr(client, action)(request).to_json_string())


def main_handler(event, context):
    result = protect(cloud_api, datetime.now(timezone.utc),
                     apply=os.environ.get("RUM_GUARD_APPLY") == "true",
                     allow_resume=os.environ.get("RUM_GUARD_AUTO_RESUME") == "true")
    print(json.dumps(result, ensure_ascii=False))
    return result
