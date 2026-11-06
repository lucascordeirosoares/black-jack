// Constantes do jogo (mudou aqui, muda em todo o código)
const FICHA_MINIMA = 10;   // menor ficha disponível
const EMPRESTIMO = 500;    // valor de cada empréstimo

let baralho = [];
let maoJogador = [];
let maoBanca = [];
let pontosJogador = 0;
let pontosBanca = 0;

let saldo = 1000;
let divida = 0;
let aposta = 0;
let vitorias = 0;
let derrotas = 0;

let jogoAtivo = false;
let bancaEscondida = true;

// CORREÇÃO: símbolos sem o "variation selector" (U+FE0F). Com ele o navegador
// desenhava emojis coloridos e ignorava a cor vermelha/preta do texto.
const naipes = [
    { nome: 'copas', simbolo: '♥', cor: 'red' },
    { nome: 'ouro', simbolo: '♦', cor: 'red' },
    { nome: 'paus', simbolo: '♣', cor: 'black' },
    { nome: 'espadas', simbolo: '♠', cor: 'black' }
];

const valores = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// Sons Web Audio API
// CORREÇÃO: o AudioContext agora é criado só no primeiro som (após um clique do usuário),
// evitando o aviso/bloqueio de autoplay dos navegadores ao carregar a página.
let audioCtx = null;

function tocarSom(frequencia, tipo = 'sine', duracao = 0.15) {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = tipo;
        osc.frequency.setValueAtTime(frequencia, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duracao);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duracao);
    } catch (e) {}
}

function somSomCarta() { tocarSom(400, 'triangle', 0.1); }
function somFicha() { tocarSom(800, 'sine', 0.08); }
function somVitoria() {
    tocarSom(523, 'sine', 0.15);
    setTimeout(() => tocarSom(659, 'sine', 0.15), 150);
    setTimeout(() => tocarSom(783, 'sine', 0.3), 300);
}
function somDerrota() {
    tocarSom(300, 'sawtooth', 0.2);
    setTimeout(() => tocarSom(220, 'sawtooth', 0.3), 200);
}

function criarBaralho() {
    baralho = [];
    for (let n of naipes) {
        for (let v of valores) {
            let peso = parseInt(v);
            if (v === 'A') peso = 11;
            if (['J', 'Q', 'K'].includes(v)) peso = 10;

            baralho.push({
                naipe: n.simbolo,
                cor: n.cor,
                valor: v,
                peso: peso
            });
        }
    }
}

function embaralharBaralho() {
    for (let i = baralho.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [baralho[i], baralho[j]] = [baralho[j], baralho[i]];
    }
}

function calcularPontuacao(mao) {
    let soma = 0;
    let ases = 0;

    for (let carta of mao) {
        soma += carta.peso;
        if (carta.valor === 'A') ases++;
    }

    while (soma > 21 && ases > 0) {
        soma -= 10;
        ases--;
    }

    return soma;
}

function limparMesa() {
    maoJogador = [];
    maoBanca = [];
    pontosJogador = 0;
    pontosBanca = 0;
    document.getElementById('cartasJogador').innerHTML = '';
    document.getElementById('cartasBanca').innerHTML = '';
    document.getElementById('pontosJogador').innerText = '0';
    document.getElementById('pontosBanca').innerText = '0';
}

/* ===================================================================
 * Sistema de Empréstimo e Cobrança
 * =================================================================== */
function solicitarEmprestimo() {
    // CORREÇÃO: antes exigia saldo === 0 / > 0 de forma rígida. Agora vale a regra
    // "o jogador não consegue mais comprar nem a menor ficha".
    if (jogoAtivo || aposta > 0 || saldo >= FICHA_MINIMA) return;

    saldo += EMPRESTIMO;
    divida += EMPRESTIMO;
    somFicha();

    exibirNotificacao(
        "O AGIOTA TE ADORA!",
        `Recebeu $${EMPRESTIMO}. Ele tem seu endereço e sabe onde sua mãe mora. Pague com as vitórias!`,
        "empate"
    );

    atualizarInterface();
}

// Paga a aposta vencedora: devolve a ficha apostada e usa o LUCRO para abater a dívida.
// Retorna quanto da dívida foi abatido.
function pagarVitoria() {
    const lucro = aposta;                          // lucro de uma vitória 1:1
    const abatido = Math.min(divida, lucro);       // nunca abate mais do que deve

    divida -= abatido;
    saldo += aposta;                               // devolve a aposta (ela já tinha saído do saldo)
    saldo += lucro - abatido;                      // o que sobrar do lucro vira saldo

    return abatido;
}

function registrarVitoria(titulo, textoBase) {
    vitorias++;
    const lucro = aposta;
    const dividaAntes = divida;
    const abatido = pagarVitoria();
    somVitoria();

    let textoMsg = `${textoBase} Lucro de $${lucro}.`;
    if (abatido > 0) {
        textoMsg += ` $${abatido} foram usados para abater sua dívida.`;
    }

    // Se esta vitória quitou a dívida inteira, troca o título pela mensagem especial
    if (dividaAntes > 0 && divida === 0) {
        titulo = "DÍVIDA ZERADA! O Agiota chorou.";
    }
    exibirNotificacao(titulo, textoMsg, "vitoria");
}

function adicionarAposta(valor) {
    if (jogoAtivo) return;

    if (maoJogador.length > 0) {
        limparMesa();
    }

    if (saldo >= valor) {
        saldo -= valor;
        aposta += valor;
        somFicha();
        atualizarInterface();
    } else {
        exibirNotificacao("Saldo Insuficiente!", "Você não possui fichas suficientes. Se ficar sem fichas, pegue um empréstimo.", "erro");
    }
}

function limparAposta() {
    if (jogoAtivo) return;
    saldo += aposta;
    aposta = 0;
    somFicha();
    limparMesa();
    atualizarInterface();
}

function iniciarRodada() {
    if (aposta === 0) {
        exibirNotificacao("Faça sua Aposta!", "Selecione as fichas para apostar antes de dar as cartas.", "erro");
        return;
    }

    limparMesa();

    criarBaralho();
    embaralharBaralho();

    maoJogador = [baralho.pop(), baralho.pop()];
    maoBanca = [baralho.pop(), baralho.pop()];

    jogoAtivo = true;
    bancaEscondida = true;

    esconderNotificacao();
    somSomCarta();

    pontosJogador = calcularPontuacao(maoJogador);
    pontosBanca = calcularPontuacao([maoBanca[0]]);

    atualizarInterface();

    if (pontosJogador === 21) {
        parar();
    }
}

function pedirCarta() {
    if (!jogoAtivo) return;

    maoJogador.push(baralho.pop());
    pontosJogador = calcularPontuacao(maoJogador);
    somSomCarta();

    if (pontosJogador >= 21) {
        parar();
    } else {
        atualizarInterface();
    }
}

function parar() {
    if (!jogoAtivo) return;

    bancaEscondida = false;
    pontosBanca = calcularPontuacao(maoBanca);

    while (pontosBanca < 17 && pontosJogador <= 21) {
        maoBanca.push(baralho.pop());
        pontosBanca = calcularPontuacao(maoBanca);
    }

    finalizarRodada();
}

function finalizarRodada() {
    jogoAtivo = false;
    atualizarInterface();

    const jogadorEstourou = pontosJogador > 21;
    const bancaEstourou = pontosBanca > 21;

    if (jogadorEstourou) {
        derrotas++;
        somDerrota();
        exibirNotificacao("VOCÊ ESTOUROU!", `Sua pontuação foi de ${pontosJogador} pontos. Aposta perdida.`, "derrota");
    } else if (bancaEstourou) {
        registrarVitoria("A BANCA ESTOUROU!", `A Banca fez ${pontosBanca} pontos.`);
    } else if (pontosJogador > pontosBanca) {
        registrarVitoria("É O PAI TÁ ON!", `${pontosJogador} vs ${pontosBanca} da Banca.`);
    } else if (pontosJogador < pontosBanca) {
        derrotas++;
        somDerrota();
        exibirNotificacao("A CASA SEMPRE GANHA, CAMPEÃO!", `A Banca fez ${pontosBanca} pontos contra seus ${pontosJogador}.`, "derrota");
    } else {
        saldo += aposta;
        exibirNotificacao("NEM TU, NEM EU!", `Ambos fizeram ${pontosJogador} pontos. Sua aposta foi devolvida.`, "empate");
    }

    aposta = 0;

    // NOVO: se o jogador quebrou, avisa na própria notificação onde está o empréstimo
    if (saldo < FICHA_MINIMA) {
        document.getElementById('mensagemSub').innerText +=
            " Você ficou sem fichas: clique em Continuar e use o botão vermelho de empréstimo no painel abaixo.";
    }

    atualizarInterface();
}

function renderizarCartaHTML(carta, escondida = false) {
    if (escondida) {
        return `
            <div class="card card-back flex items-center justify-center">
                <i class="fa-solid fa-shield-halved text-white/30 text-2xl sm:text-3xl"></i>
            </div>
        `;
    }

    const corTexto = carta.cor === 'red' ? 'text-red-600' : 'text-slate-900';

    return `
        <div class="card p-1.5 sm:p-2 flex flex-col justify-between ${corTexto}">
            <div class="text-left font-bold text-xs sm:text-base leading-none">
                <div>${carta.valor}</div>
                <div class="text-xs sm:text-sm">${carta.naipe}</div>
            </div>
            <div class="text-center text-xl sm:text-3xl my-auto">
                ${carta.naipe}
            </div>
            <div class="text-right font-bold text-xs sm:text-base leading-none rotate-180">
                <div>${carta.valor}</div>
                <div class="text-xs sm:text-sm">${carta.naipe}</div>
            </div>
        </div>
    `;
}

function atualizarInterface() {
    document.getElementById('saldoAtual').innerText = saldo;
    document.getElementById('dividaAtual').innerText = divida;
    document.getElementById('apostaAtual').innerText = aposta;
    document.getElementById('statVitorias').innerText = vitorias;
    document.getElementById('statDerrotas').innerText = derrotas;

    // Controle de visibilidade do Botão de Empréstimo
    // CORREÇÃO: usa "saldo < FICHA_MINIMA" em vez de "saldo === 0"
    const btnEmp = document.getElementById('btnEmprestimo');
    if (saldo < FICHA_MINIMA && aposta === 0 && !jogoAtivo) {
        btnEmp.classList.remove('hidden');
    } else {
        btnEmp.classList.add('hidden');
    }

    const divBanca = document.getElementById('cartasBanca');
    divBanca.innerHTML = '';
    if (maoBanca.length > 0) {
        maoBanca.forEach((carta, index) => {
            const estaEscondida = (index === 1 && bancaEscondida);
            divBanca.innerHTML += renderizarCartaHTML(carta, estaEscondida);
        });
        document.getElementById('pontosBanca').innerText = bancaEscondida ? calcularPontuacao([maoBanca[0]]) : pontosBanca;
    }

    const divJogador = document.getElementById('cartasJogador');
    divJogador.innerHTML = '';
    if (maoJogador.length > 0) {
        maoJogador.forEach(carta => {
            divJogador.innerHTML += renderizarCartaHTML(carta);
        });
        document.getElementById('pontosJogador').innerText = pontosJogador;
    }

    document.getElementById('btnPedir').disabled = !jogoAtivo;
    document.getElementById('btnParar').disabled = !jogoAtivo;
    document.getElementById('btnNovoJogo').disabled = jogoAtivo;
    document.getElementById('btnLimparAposta').disabled = jogoAtivo || aposta === 0;
}

function exibirNotificacao(titulo, subtexto, tipo) {
    const painel = document.getElementById('painelMensagem');
    const box = document.getElementById('mensagemBox');
    const txtTitulo = document.getElementById('mensagemTitulo');
    const txtSub = document.getElementById('mensagemSub');

    txtTitulo.innerText = titulo;
    txtSub.innerText = subtexto;

    box.className = "p-4 sm:p-6 rounded-2xl shadow-2xl backdrop-blur-md border-2 transition-all pointer-events-auto ";

    if (tipo === 'vitoria') {
        box.classList.add('bg-emerald-950/95', 'border-emerald-500', 'text-emerald-300');
    } else if (tipo === 'derrota') {
        box.classList.add('bg-rose-950/95', 'border-rose-500', 'text-rose-300');
    } else if (tipo === 'empate') {
        box.classList.add('bg-amber-950/95', 'border-amber-500', 'text-amber-300');
    } else {
        box.classList.add('bg-slate-900/95', 'border-slate-600', 'text-slate-200');
    }

    painel.classList.remove('opacity-0', 'scale-95', 'pointer-events-none');
    painel.classList.add('opacity-100', 'scale-100');
}

function esconderNotificacao() {
    const painel = document.getElementById('painelMensagem');
    painel.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
    painel.classList.remove('opacity-100', 'scale-100');

    if (!jogoAtivo) {
        limparMesa();
    }
}

window.onload = () => {
    atualizarInterface();
};
