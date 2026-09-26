import importlib.util
import json
import unittest
from datetime import datetime, timezone
from pathlib import Path
spec = importlib.util.spec_from_file_location("guard", Path(__file__).with_name("function.py"))
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)

def result(count):
    return {"Result": json.dumps({"results": [{"series": [{"columns": ["time", "allCount"], "values": [[0, count]]}]}]})}

class GuardTest(unittest.TestCase):
    def run_guard(self, counts, when="2026-09-26T01:00:00+00:00", **kwargs):
        self.calls = []
        def api(region, action, params):
            self.calls.append((region, action, params))
            if action == "DescribeTawInstances":
                return {"TotalCount": len(counts), "InstanceSet": [{"InstanceId": key, "AreaId": 1} for key in counts]}
            if action == "DescribeDataReportCountV2":
                value = counts[params["InstanceID"]]
                if isinstance(value, Exception): raise value
                return result(value)
            return {"RequestId": "fake"}
        return guard.protect(api, datetime.fromisoformat(when), **kwargs)
    def test_shared_total_at_limit_stops_only_target(self):
        report = self.run_guard(dict(zip([guard.INSTANCE_ID,"rum-two","rum-three"], [200000,100000,100000])), apply=True)
        self.assertEqual(report["total"], 400000)
        self.assertEqual(self.calls[-1], ("ap-guangzhou", "StopProject", {"ProjectId":159589}))
    def test_below_limit_does_not_resume_during_day(self):
        self.run_guard(dict.fromkeys([guard.INSTANCE_ID,"rum-two","rum-three"],0), apply=True, allow_resume=True)
        self.assertEqual(len(self.calls), 4)
    def test_next_day_reset_window_resumes(self):
        self.run_guard(dict.fromkeys([guard.INSTANCE_ID,"rum-two","rum-three"],0), when="2026-09-26T16:06:00+00:00", apply=True, allow_resume=True)
        self.assertEqual(self.calls[-1][1], "ResumeProject")
        self.assertEqual(self.calls[1][2]["StartTime"],int(datetime(2026,9,26,16,tzinfo=timezone.utc).timestamp()))
    def test_unknown_usage_fails_closed(self):
        report=self.run_guard(dict.fromkeys([guard.INSTANCE_ID,"rum-two","rum-three"],RuntimeError("offline")),apply=True)
        self.assertEqual(report["status"],"query_failed_stopped")
        self.assertEqual(self.calls[-1][1],"StopProject")
    def test_dry_run_never_mutates(self):
        self.run_guard(dict.fromkeys([guard.INSTANCE_ID,"rum-two","rum-three"],500000))
        self.assertEqual(len(self.calls),4)
    def test_bad_schema_is_not_zero(self):
        for data in [{}, {"results":[]}, {"results":[{"series":[]}]}, {"results":[{"series":[{"columns":["count"],"values":[]}]}]}]:
            with self.assertRaises(ValueError): guard.parse_count(json.dumps(data))
    def test_empty_documented_values_are_zero(self):
        self.assertEqual(guard.parse_count(json.dumps({"results":[{"series":[{"columns":["time","allCount"],"values":[]}]}]})),0)
    def test_live_empty_query_is_zero(self):
        self.assertEqual(guard.parse_count('{"results":[{"statement_id":0,"offset":"","total":0}]}'),0)
    def test_incomplete_inventory_stops(self):
        calls=[]
        def api(region,action,params):
            calls.append(action)
            return {"TotalCount": 2, "InstanceSet": [{"InstanceId":guard.INSTANCE_ID,"AreaId":1}]}
        guard.protect(api,datetime.now(timezone.utc),apply=True)
        self.assertEqual(calls[-1],"StopProject")
    def test_unknown_region_stops(self):
        calls=[]
        def api(region,action,params):
            calls.append(action)
            return {"TotalCount":1,"InstanceSet":[{"InstanceId":guard.INSTANCE_ID,"AreaId":99}]}
        guard.protect(api,datetime.now(timezone.utc),apply=True)
        self.assertEqual(calls[-1],"StopProject")
    def test_stop_failure_propagates(self):
        def api(*args): raise RuntimeError("unavailable")
        with self.assertRaises(RuntimeError): guard.protect(api,datetime.now(timezone.utc),apply=True)

if __name__ == "__main__": unittest.main()
