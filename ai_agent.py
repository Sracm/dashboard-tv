"""
Agente de IA Integrado com OpenRouter
- Tomada de Decisão / Roteamento Estruturado: typesafe/jev-router
- Execução / Resposta e Análise Conversacional: openai/gpt-4o-mini
"""

import os
import sys
import json
import urllib.request
import urllib.error

# Garante saída UTF-8 no terminal Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "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")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

class TypeSafeAgent:
    def __init__(self, api_key: str = OPENROUTER_API_KEY):
        self.api_key = api_key
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "User-Agent": "MQ-AI-Agent/1.0"
        }

    def _call_openrouter(self, model: str, messages: list, temperature: float = 0.2) -> str:
        payload = json.dumps({
            "model": model,
            "messages": messages,
            "temperature": temperature
        }).encode("utf-8")

        req = urllib.request.Request(OPENROUTER_URL, data=payload, headers=self.headers)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data["choices"][0]["message"]["content"]
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8")
            raise RuntimeError(f"OpenRouter HTTP {e.code}: {err_body}")
        except Exception as e:
            raise RuntimeError(f"Erro de conexão OpenRouter: {e}")

    def decide(self, user_input: str, context: dict = None) -> dict:
        """
        Utiliza o TypeSafe Jev Router para tomada de decisão estruturada e segura.
        """
        system_prompt = (
            "Você é o TypeSafe Jev Decision Engine. Sua função exclusiva é avaliar o estado e a entrada do usuário "
            "e tomar uma decisão estruturada estritamente em formato JSON.\n"
            "Retorne sempre um JSON válido no formato:\n"
            "{\n"
            "  \"intencao\": \"consultar_dados | filtrar_relatorio | analise_financeira | suporte_tecnico | desconhecido\",\n"
            "  \"setor\": \"logistica | distribuiçao | ecommerce | comex | rh | ti | financeiro | geral\",\n"
            "  \"acao_recomendada\": \"descricao da acao a ser tomada\",\n"
            "  \"confianca\": 0.0 a 1.0\n"
            "}"
        )
        
        ctx_str = json.dumps(context or {}, ensure_ascii=False)
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Contexto: {ctx_str}\nEntrada do Usuário: {user_input}"}
        ]
        
        raw_decision = self._call_openrouter("typesafe/jev-router", messages, temperature=0.0)
        
        # Parse JSON seguro
        try:
            # Limpa possíveis blocos de markdown ```json ```
            cleaned = raw_decision.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("\n", 1)[1]
                if cleaned.endswith("```"):
                    cleaned = cleaned.rsplit("\n", 1)[0]
            decision_dict = json.loads(cleaned.strip())
        except Exception:
            decision_dict = {
                "intencao": "geral",
                "setor": "geral",
                "acao_recomendada": raw_decision,
                "confianca": 0.5
            }
            
        return decision_dict

    def run(self, user_input: str, context: dict = None) -> dict:
        """
        Fluxo Completo do Agente:
        1. Jev Router avalia e toma a decisão estruturada (Type-Safe).
        2. GPT-4o-mini gera a resposta conversacional baseada na decisão.
        """
        # Passo 1: Tomada de Decisão com TypeSafe Jev
        decision = self.decide(user_input, context)
        
        # Passo 2: Execução e Resposta com GPT-4o-mini
        ctx_formatted = json.dumps(context or {}, ensure_ascii=False, indent=2)
        messages = [
            {
                "role": "system",
                "content": (
                    "Você é a MQIA, Assistente Virtual Corporativa da MQ HAIR integrada aos Dashboards de BI e TV.\n"
                    f"A decisão estruturada tomada pelo mecanismo TypeSafe Jev foi:\n{json.dumps(decision, ensure_ascii=False, indent=2)}\n\n"
                    f"Contexto e Métricas do Dashboard:\n{ctx_formatted}\n\n"
                    "Diretrizes:\n"
                    "- Responda ao usuário com base na decisão do TypeSafe Jev e nas métricas do contexto.\n"
                    "- Seja conciso, corporativo, profissional e direto ao ponto.\n"
                    "- Utilize formatação Markdown (negritos, listas e números bem formatados em R$).\n"
                    "- Se o usuário perguntar sobre faturamento, canais ou metas e os dados estiverem no contexto, apresente-os claramente."
                )
            },
            {"role": "user", "content": user_input}
        ]
        
        response_text = self._call_openrouter("openai/gpt-4o-mini", messages, temperature=0.3)
        
        return {
            "decisao_typesafe_jev": decision,
            "resposta_gpt4o_mini": response_text
        }


if __name__ == "__main__":
    print("Iniciando teste do agente integrado...")
    agent = TypeSafeAgent()
    
    pergunta_teste = "Preciso dos números de faturamento da equipe de Distribuição e Fora SP."
    print(f"\nPergunta: '{pergunta_teste}'")
    
    resultado = agent.run(pergunta_teste, context={"usuario": "ricardo.pavao", "canal": "Distribuição"})
    
    print("\n--- DECISÃO TOMADA PELO TYPESAFE JEV ---")
    print(json.dumps(resultado["decisao_typesafe_jev"], indent=2, ensure_ascii=False))
    
    print("\n--- RESPOSTA GERADA PELO GPT-4O-MINI ---")
    print(resultado["resposta_gpt4o_mini"])
