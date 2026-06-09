class MainOrchestrator:
    def __init__(self):
        self.token_saver = TokenSaverAgent()
    
    def execute_task(self, task: dict):
        # Cek budget terlebih dahulu
        if not self.token_saver.check_budget(1000):
            return {"status": "budget_exceeded"}
        
        # Optimasi task
        strategy = self.token_saver.analyze_task(task)
        task["prompt"] = self.token_saver.optimize_prompt(task["prompt"])
        
        # Eksekusi dengan batasan token
        result = self._call_api(task, strategy["max_tokens"])
        
        # Catat penggunaan
        self.token_saver.log_usage(result["tokens_used"])
        
        return result
