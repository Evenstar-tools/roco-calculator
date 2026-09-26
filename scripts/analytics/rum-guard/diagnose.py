"""Read-only deployment check; returns aggregate usage or a sanitized error code."""
import os
from datetime import datetime, timezone
from function import cloud_api, REGIONS, TZ


def main_handler(event, context):
    now = datetime.now(timezone.utc)
    start = now.astimezone(TZ).replace(hour=0, minute=0, second=0, microsecond=0)
    results = {}
    for region in ("ap-guangzhou",):
        try:
            results[region] = cloud_api(region, "DescribeDataReportCountV2", {"InstanceID": "rum-8NszeyHgNeZp5y", "StartTime": int(start.timestamp()), "EndTime": int(now.timestamp())})
        except Exception as error:
            message = error.get_message() if hasattr(error, "get_message") else type(error).__name__
            for name in ("TENCENTCLOUD_SECRETID", "TENCENTCLOUD_SECRETKEY", "TENCENTCLOUD_SESSIONTOKEN"):
                if os.environ.get(name):
                    message = message.replace(os.environ[name], "[redacted]")
            results[region] = {"errorType": type(error).__name__, "code": error.get_code() if hasattr(error, "get_code") else None, "message": message[:500]}
    results["inventory"] = {region: cloud_api(region, "DescribeTawInstances", {"Limit": 100, "Offset": 0}) for region in REGIONS}
    return results
