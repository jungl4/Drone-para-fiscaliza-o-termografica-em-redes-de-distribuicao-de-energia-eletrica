Drone testbed

Este diretório contém um testbed (simulador leve) para testar o controlador de estabilidade implementado em `src/controle_de_voo.js` sem precisar do drone físico.

Visão geral
-----------

O testbed inclui:

- `mockClient.js`: uma implementação mínima que emula a API usada do pacote `ar-drone` (métodos como `front`, `right`, `clockwise` e evento `navdata`).
- `node_modules/ar-drone/index.js`: mock local para garantir que `require('ar-drone')` usado no código principal resolva para o mock do testbed.
- `simulator.js`: um loop de simulação que emite pacotes `navdata` (velocidades em cm/s e rotação em deg/s), aplica perturbações ("rajadas de vento") e executa o controlador via `takeoffAndStartStabilize()`.

Objetivo
--------

Permitir ajustar e validar a lógica de controle (PID) sem risco ao hardware, verificando:

- Se o controlador reage a drifts (velocidade não-zero enquanto em idle).
- Se o controlador corrige rotações indesejadas (yaw).
- Como os parâmetros KP/KI/KD afetam a estabilidade (overshoot, tempo de acomodação, oscilação).

Como usar
---------

1. Abra um terminal e navegue para `drone-testbed`.

2. Instale dependências:

```bash
npm install
```

3. Execute o simulador:

```bash
npm start
```

4. Observe o console: o `mockClient` irá logar comandos aplicados (`front`, `left`, `clockwise`, etc.). O simulador imprimirá mensagens de inicialização.

Onde ajustar os parâmetros
--------------------------

- Ganhos PID: edite `STAB.pid` em `src/controle_de_voo.js` (roll/pitch/yaw). Valores iniciais são conservadores. Cada vez que alterar, reinicie o simulador.
- Taxa do loop: `STAB.LOOP_HZ` controla a frequência de controle. No simulador, o loop também usa essa frequência para emitir navdata.
- Deadband: `STAB.VELOCITY_DEADBAND_CM_S` filtra pequenas velocidades para evitar jitter.

Testes e cenários possíveis
--------------------------

O simulador suporta — e é fácil de estender para — os seguintes testes:

- Drift contínuo: aplique um offset constante nas velocidades iniciais dentro de `simulator.js` para ver se o controlador consegue trazer as velocidades para zero.
- Rajadas de vento: o `simulator.js` já aplica perturbações aleatórias ocasionais; aumentar a probabilidade/amplitude testa a robustez.
- Oscilação por ganho alto: aumente `kp` e observe overshoot/oscilações; então ajuste `kd` e `ki` para amortecimento e offset.
- Desligamento de controle: pare a estabilização chamando `stopStabilizationLoop()` manualmente (pode-se adicionar um comando via stdin) para testar comportamento sem correção.

Logs e telemetria
------------------

Atualmente o mock apenas imprime comandos recebidos. Melhorias possíveis:

- Log periódico das leituras (vx, vy, yawRate) e saídas do PID. Isso facilita plotagem e análise.
- Salvar telemetria em CSV/JSON para pós-processamento (plot com Python/Excel).

Endpoints HTTP (servidor embutido)
--------------------------------

O simulador agora inclui um servidor HTTP para inspeção e tuning em runtime (porta padrão 3001). Endpoints disponíveis:

- GET /status
	- Retorna JSON com estado atual, últimos comandos e ganhos PID.

- POST /pid
	- Exemplo: alterar ganhos do eixo pitch
		- curl -X POST http://localhost:3001/pid -H 'Content-Type: application/json' -d '{"axis":"pitch","kp":0.02,"ki":0.0006,"kd":0.005}'
	- Body: { axis: "roll"|"pitch"|"yaw", kp?, ki?, kd? }

- POST /start
	- Inicia o loop de estabilização (chama startStabilizationLoop()).

- POST /stop
	- Para o loop de estabilização (chama stopStabilizationLoop()).

- GET /telemetry?last=N
	- Retorna os últimos N pontos de telemetria (JSON). Default N=500.

- POST /save-telemetry
	- Salva todo o buffer de telemetria atual em arquivo JSON em `drone-testbed/logs/telemetry-<timestamp>.json`.

Exemplos rápidos (no terminal do host):

```bash
# ver estado
curl http://localhost:3001/status | jq .

# mudar PID do roll
curl -X POST http://localhost:3001/pid -H 'Content-Type: application/json' \
	-d '{"axis":"roll","kp":0.02,"ki":0.0003,"kd":0.006}'

# obter telemetria (últimos 200 pontos)
curl 'http://localhost:3001/telemetry?last=200' | jq . | less

# salvar telemetria em arquivo no diretório logs
curl -X POST http://localhost:3001/save-telemetry
```

Execução simples com 2 comandos
--------------------------------

Se você só quer uma maneira simples de testar o seu código com dois comandos (1 para iniciar o servidor/testbed e 1 para rodar o seu script de controle), existem duas formas rápidas:

- Opção A (recomendada): usar o wrapper pronto — o wrapper adiciona o mock `ar-drone` do `drone-testbed` ao module path e executa o seu controlador:

```bash
# na raiz do projeto, inicie o servidor (UI + WS + simulador interno de fallback)
node drone-testbed/server.js

# em outro terminal, inicie seu controlador usando o wrapper (ele carrega o src/controle_de_voo.js do projeto pai)
node drone-testbed/run_controller_with_mock.js
```

Com isso você precisa apenas desses dois comandos. O wrapper chamará `takeoffAndStartStabilize()` do controlador se essa função existir.

- Opção B: rodar o controlador diretamente — defina `NODE_PATH` para apontar ao `drone-testbed/node_modules` antes de executar o seu script, assim o `require('ar-drone')` do seu código irá resolver para o proxy WS:

```bash
# na raiz do projeto
node drone-testbed/server.js

# em outro terminal (na raiz do projeto)
export NODE_PATH=$(pwd)/drone-testbed/node_modules
node src/controle_de_voo.js
```

Se preferir, você pode criar um npm script que faça isso automaticamente.

Problemas comuns
----------------
- Se você vir "navdata timeout" ao executar o controlador, verifique se o servidor (`node drone-testbed/server.js`) está rodando e escutando na porta 3001. O proxy do `ar-drone` tenta se conectar automaticamente ao `ws://localhost:3001`.
- Se o wrapper não conectar ao servidor, confira `drone-testbed/wrapper.out` e `drone-testbed/server.out` para mensagens de erro.


Onde os logs são salvos
-----------------------

Os arquivos de telemetria são salvos em `drone-testbed/logs/` com o padrão `telemetry-<timestamp>.json`. Você pode carregar esse JSON em Python ou qualquer ferramenta para plotar vx/vy/yaw ao longo do tempo.

Melhorias recomendadas (próximos passos)
--------------------------------------

1. Filtragem: adicionar filtro passa-baixa (média móvel ou filtro exponencial) às leituras de velocidade para reduzir ruído.
2. Dinâmica mais realista: mapear comandos do mock (`front`, `right`, `clockwise`) para acelerações na simulação, para que o PID tenha um efeito físico mensurável (atualmente o mock apenas loga comandos).
3. Interface de tuning em tempo real: adicionar um pequeno servidor HTTP ou interface stdin para ajustar `STAB.pid` em runtime.
4. Testes automatizados: adicionar unit tests para a classe PID e testes de integração para validar convergência em cenários simulados.
5. Visualização: exportar telemetria e gerar gráficos (matplotlib/plotly) para análise de desempenho.

Segurança e recomendações para teste com o drone real
----------------------------------------------------

- Utilize sempre um espaço aberto e seguros ao testar com hardware real.
- Comece com ganhos muito pequenos e aumente gradualmente.
- Ative limites de segurança (altitude máxima e mínima, timeout de navdata) antes de testar no ar.

Contato
-------

Se quiser, posso:

- Adicionar logs verbosos e salvar telemetria em arquivo.
- Implementar a dinâmica do drone no simulador (mapeamento comando→aceleração→velocidade).
- Adicionar um CLI para ajustar ganhos em runtime.

Escolha uma opção e eu implemento a próxima iteração do testbed.
