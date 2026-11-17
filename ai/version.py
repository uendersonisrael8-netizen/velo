"""Versão única do serviço da velo ia.

Fica em um módulo separado para funcionar tanto com o pacote `ai` (rodando da
raiz do repositório) quanto com os arquivos soltos na raiz de um Hugging Face
Space, onde `engine.py` e `serve_velo_ia.py` são módulos de primeiro nível.
"""

__version__ = "1.2.0"
