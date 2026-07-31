class TokenSaverAgent:
    """Sub-agent untuk mengoptimalkan penggunaan token API"""
    
    def __init__(self, max_tokens_per_task=500, budget_per_hour=5000):
        self.max_tokens_per_task = max_tokens_per_task
        self.budget_per_hour = budget_per_hour
        self.used_tokens = 0
        self.task_queue = []
    
    def analyze_task(self, task: dict) -> dict:
        """Analisis task dan tentukan strategi penghematan"""
        complexity = self._estimate_complexity(task)
        
        strategy = {
            "use_cache": task.get("repeatable", False),
            "summarize_context": complexity > 0.7,
            "batch_requests": len(self.task_queue) > 3,
            "use_templates": True,
            "compress_prompts": True,
            "max_tokens": self._calculate_optimal_tokens(complexity)
        }
        return strategy
    
    def optimize_prompt(self, prompt: str) -> str:
        """Kompresi prompt tanpa menghilangkan esensi"""
        optimizations = [
            self._remove_redundancy,
            self._use_abbreviations,
            self._compress_examples
        ]
        
        for opt in optimizations:
            prompt = opt(prompt)
        return prompt
    
    def check_budget(self, estimated_tokens: int) -> bool:
        """Cek apakah masih dalam budget"""
        return (self.used_tokens + estimated_tokens) <= self.budget_per_hour
    
    def _estimate_complexity(self, task: dict) -> float:
        """Estimasi kompleksitas task (0-1)"""
        factors = len(task.get("context", "").split())
        return min(factors / 1000, 1.0)
    
    def _calculate_optimal_tokens(self, complexity: float) -> int:
        """Hitung token optimal berdasarkan kompleksitas"""
        base = 200
        return int(base + (complexity * 300))
    
    def _remove_redundancy(self, text: str) -> str:
        """Hapus teks redundan"""
        return " ".join(dict.fromkeys(text.split()))
    
    def _use_abbreviations(self, text: str) -> str:
        """Ganti kata panjang dengan singkatan"""
        replacements = {
            "silahkan": "slh", 
            "informasi": "info",
            "terima kasih": "tq"
        }
        for long, short in replacements.items():
            text = text.replace(long, short)
        return text
    
    def _compress_examples(self, text: str) -> str:
        """Kompresi contoh panjang"""
        return text[:len(text)//2] + "..."
    
    def log_usage(self, tokens_used: int):
        """Catat penggunaan token"""
        self.used_tokens += tokens_used
        print(f"📊 Token: {self.used_tokens}/{self.budget_per_hour}")
