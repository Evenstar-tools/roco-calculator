"""Read-only deployment check; returns aggregate usage or a sanitized error code."""
from datetime import datetime, timezone
from function import cloud_api, REGIONS, TZ


def main_handler(event, context):
    now = datetime.now(timezone.utc)
    start = now.astimezone(TZ).replace(hour=0, minute=0, second=0, microsecond=0)
    results = {}
    for region in REGIONS:
        try:
            results[region] = cloud_api(region, "DescribeDataReportCountV2", {"StartTime": int(start.timestamp()), "EndTime": int(now.timestamp())})
        except Exception as error:
            results[region] = {"errorType": type(error).__name__, "code": error.get_code() if hasattr(error, "get_code") else None}
    return results
