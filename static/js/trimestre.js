// ============================================================
// trimestre.js — Aba TRIMESTRE
// Acompanhamento de Performance Trimestral e Semestral
// ============================================================

const NUM_CARDS = 5;
let trimestreCharts = [];
let nextUpdateSeconds = 600;

function navigateTab(path) {
    pararTodosAudios();
    if (path === '/tv' || path === '/') {
        window.location.href = '/tv';
        return;
    }
    const ano = document.getElementById('filter-year')?.value || new Date().getFullYear();
    window.location.href = `${path}?ano=${ano}`;
}

window.addEventListener('beforeunload', () => pararTodosAudios());
window.addEventListener('pagehide', () => pararTodosAudios());

function updateClock() {
    const now = new Date();
    const clockEl = document.getElementById('clock');
    const dateEl = document.getElementById('date');
    if (clockEl) clockEl.innerText = now.toLocaleTimeString('pt-BR');
    if (dateEl) dateEl.innerText = now.toLocaleDateString('pt-BR');

    nextUpdateSeconds--;
    if (nextUpdateSeconds <= 0) {
        nextUpdateSeconds = 600;
        fetchData(true);
    }
    
    const nextUpdateEl = document.getElementById('next-update');
    if (nextUpdateEl) {
        const min = Math.floor(nextUpdateSeconds / 60);
        const sec = nextUpdateSeconds % 60;
        nextUpdateEl.innerText = `Próxima atualização em: ${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }
}

function getTrimestreGaugeOption(percent, diff) {
    const isSuccess = percent >= 100;
    const sign = diff >= 0 ? '+' : '';
    const diffText = sign + diff.toFixed(1) + '%';
    const diffColor = diff >= 0 ? '#00d26a' : '#ff2424';

    return {
        series: [
            {
                type: 'gauge',
                startAngle: 180,
                endAngle: 0,
                min: 0,
                max: 120,
                splitNumber: 12,
                radius: '118%',
                center: ['50%', '67%'],
                axisLine: {
                    lineStyle: {
                        width: 22,
                        color: [
                            [80 / 120, '#ff2424'],
                            [100 / 120, '#ffd600'],
                            [1, '#00d26a']
                        ]
                    }
                },
                pointer: {
                    icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
                    length: '62%',
                    width: 8,
                    offsetCenter: [0, '-4%'],
                    itemStyle: { 
                        color: '#f5c518',
                        shadowColor: 'rgba(0,0,0,0.6)',
                        shadowBlur: 4
                    }
                },
                axisTick: {
                    length: 6,
                    lineStyle: { color: 'auto', width: 1.2 }
                },
                splitLine: {
                    length: 12,
                    lineStyle: { color: 'auto', width: 2 }
                },
                axisLabel: {
                    show: false
                },
                title: {
                    offsetCenter: [0, '16%'],
                    fontSize: 24,
                    color: '#ffffff',
                    fontWeight: '800',
                    fontFamily: 'Montserrat'
                },
                detail: {
                    fontSize: 16,
                    offsetCenter: [0, '40%'],
                    valueAnimation: true,
                    formatter: function () {
                        return diffText;
                    },
                    color: diffColor,
                    fontWeight: '700',
                    fontFamily: 'Montserrat'
                },
                data: [{ value: Math.min(Math.max(percent, 0), 120), name: percent.toFixed(1) + '%' }]
            }
        ]
    };
}

function initCharts() {
    for (let i = 0; i < NUM_CARDS; i++) {
        const el = document.getElementById(`gauge-${i}`);
        if (el) {
            trimestreCharts[i] = echarts.init(el);
        }
    }
}

async function fetchData(forceRefresh = false) {
    const mes = document.getElementById('filter-month')?.value || (new Date().getMonth() + 1);
    const ano = document.getElementById('filter-year').value;
    
    try {
        let url = `/api/trimestre_tv?mes=${mes}&ano=${ano}`;
        if (forceRefresh) {
            url += `&refresh=1&_t=${Date.now()}`;
        }
        const response = await fetch(url);
        const json = await response.json();
        
        if (json.success && json.data) {
            json.data.forEach((item, index) => {
                const titleEl = document.getElementById(`title-${index}`);
                if (titleEl && item.title) {
                    titleEl.innerText = item.title;
                }
                if (trimestreCharts[index]) {
                    trimestreCharts[index].setOption(getTrimestreGaugeOption(item.percent, item.diff));
                }
            });

            const lastUpdateEl = document.getElementById('last-update');
            if (lastUpdateEl) {
                lastUpdateEl.innerText = `Última atualização: ${new Date().toLocaleTimeString('pt-BR')}`;
            }
        }
    } catch (e) {
        console.error("Erro ao carregar dados do trimestre:", e);
    }
}

function manualRefresh() {
    nextUpdateSeconds = 600;
    fetchData(true);
}

let sireneTimeout = null;
let musicaTimeout = null;

function pararTodosAudios() {
    if (sireneTimeout) {
        clearTimeout(sireneTimeout);
        sireneTimeout = null;
    }
    if (musicaTimeout) {
        clearTimeout(musicaTimeout);
        musicaTimeout = null;
    }
    const audioSirene = document.getElementById('victory-sound');
    const audioMusica = document.getElementById('music-sound');
    if (audioSirene) {
        audioSirene.pause();
        audioSirene.currentTime = 0;
        audioSirene.onended = null;
    }
    if (audioMusica) {
        audioMusica.pause();
        audioMusica.currentTime = 0;
    }
}

function testarAudio() {
    tocarAudioMetaEmpresa();
}

function tocarAudioMetaEmpresa() {
    pararTodosAudios();

    const audioSirene = document.getElementById('victory-sound');
    const audioMusica = document.getElementById('music-sound');

    const tocarMusica = () => {
        if (audioSirene) {
            audioSirene.pause();
            audioSirene.currentTime = 0;
            audioSirene.onended = null;
        }
        if (audioMusica) {
            audioMusica.currentTime = 0;
            audioMusica.play().catch(e => console.warn("Erro ao tocar música:", e));
            musicaTimeout = setTimeout(() => {
                audioMusica.pause();
                audioMusica.currentTime = 0;
            }, 10000);
        }
    };

    if (audioSirene) {
        audioSirene.currentTime = 0;
        audioSirene.play().then(() => {
            sireneTimeout = setTimeout(() => {
                tocarMusica();
            }, 10000);

            audioSirene.onended = () => {
                if (sireneTimeout) {
                    clearTimeout(sireneTimeout);
                    sireneTimeout = null;
                }
                tocarMusica();
            };
        }).catch(e => {
            console.warn("Erro ao tocar sirene:", e);
            tocarMusica();
        });
    } else {
        tocarMusica();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Sincronizar parâmetros de URL
    const params = new URLSearchParams(window.location.search);
    const anoParam = params.get('ano');
    
    if (anoParam && document.getElementById('filter-year')) {
        document.getElementById('filter-year').value = anoParam;
    } else if (document.getElementById('filter-year')) {
        document.getElementById('filter-year').value = new Date().getFullYear();
    }

    initCharts();
    fetchData();

    setInterval(updateClock, 1000);
    updateClock();

    window.addEventListener('resize', () => {
        trimestreCharts.forEach(c => c && c.resize());
    });
});
