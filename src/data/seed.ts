import type {
  Agent,
  Broadcast,
  Campaign,
  ChatbotFlow,
  Connection,
  Contact,
  Conversation,
  CustomField,
  Deal,
  Department,
  FollowUp,
  KnowledgeItem,
  LeadSource,
  Message,
  Notification,
  Pipeline,
  Product,
  QuickReply,
  ScheduledMessage,
  Settings,
  Tag,
  Task,
  User,
} from '../types';
import { pickColor } from '../lib/utils';
import { DEMO_PASSWORD_HASH } from '../lib/password';

export interface DataState {
  settings: Settings;
  users: User[];
  departments: Department[];
  tags: Tag[];
  contacts: Contact[];
  conversations: Conversation[];
  messages: Message[];
  pipelines: Pipeline[];
  deals: Deal[];
  tasks: Task[];
  products: Product[];
  agents: Agent[];
  knowledge: KnowledgeItem[];
  followUps: FollowUp[];
  connections: Connection[];
  quickReplies: QuickReply[];
  campaigns: Campaign[];
  notifications: Notification[];
  broadcasts: Broadcast[];
  scheduled: ScheduledMessage[];
  chatbots: ChatbotFlow[];
  customFields: CustomField[];
}

export const COLLECTIONS = [
  'users',
  'departments',
  'tags',
  'contacts',
  'conversations',
  'messages',
  'pipelines',
  'deals',
  'tasks',
  'products',
  'agents',
  'knowledge',
  'followUps',
  'connections',
  'quickReplies',
  'campaigns',
  'notifications',
  'broadcasts',
  'scheduled',
  'chatbots',
  'customFields',
] as const satisfies readonly (keyof DataState)[];

export type CollectionName = (typeof COLLECTIONS)[number];

export const DEFAULT_SETTINGS: Settings = {
  companyName: 'Minha Empresa',
  businessType: 'Serviços',
  timezone: 'America/Sao_Paulo',
  brandColor: '#00a389',
  logoText: 'LeadFlow',
  onboarded: false,
  businessHours: { start: '08:00', end: '18:00', days: [1, 2, 3, 4, 5] },
  outOfHoursMessage:
    'Olá! Nosso horário de atendimento é de segunda a sexta, das 8h às 18h. Assim que voltarmos, respondemos você. 😊',
  autoAssign: true,
  aiProvider: 'anthropic',
};

/** Base vazia — usada quando o cliente escolhe "começar do zero" no onboarding. */
export function emptyState(settings: Partial<Settings> = {}, admin?: User): DataState {
  return {
    settings: { ...DEFAULT_SETTINGS, ...settings },
    users: admin ? [admin] : [],
    departments: [{ id: 'dep-comercial', name: 'Comercial', color: '#2a78d6' }],
    tags: [
      { id: 'tag-quente', name: 'Lead quente', color: '#e34948' },
      { id: 'tag-frio', name: 'Lead frio', color: '#2a78d6' },
      { id: 'tag-cliente', name: 'Cliente', color: '#1baf7a' },
    ],
    contacts: [],
    conversations: [],
    messages: [],
    pipelines: [defaultPipeline()],
    deals: [],
    tasks: [],
    products: [],
    agents: [],
    knowledge: [],
    followUps: [],
    connections: [],
    quickReplies: [
      { id: 'qr-ola', shortcut: 'ola', content: 'Olá {{nome}}! Tudo bem? Aqui é da {{empresa}}. Como posso te ajudar?' },
    ],
    campaigns: [],
    notifications: [],
    broadcasts: [],
    scheduled: [],
    chatbots: [],
    customFields: [],
  };
}

export function defaultPipeline(): Pipeline {
  return {
    id: 'pip-vendas',
    name: 'Funil de vendas',
    stages: [
      { id: 'stg-novo', name: 'Novo lead', color: '#86b6ef', probability: 10 },
      { id: 'stg-qualificado', name: 'Qualificado', color: '#5598e7', probability: 30 },
      { id: 'stg-proposta', name: 'Proposta enviada', color: '#2a78d6', probability: 60 },
      { id: 'stg-negociacao', name: 'Negociação', color: '#1c5cab', probability: 80 },
      { id: 'stg-fechamento', name: 'Fechamento', color: '#104281', probability: 95 },
    ],
  };
}

// ------------------------------------------------------------------
// Dados de demonstração
// ------------------------------------------------------------------

const H = 3_600_000;
const D = 24 * H;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const ahead = (ms: number) => new Date(Date.now() + ms).toISOString();

const FIRST = [
  'Ana', 'Bruno', 'Carla', 'Diego', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João',
  'Larissa', 'Marcos', 'Natália', 'Otávio', 'Patrícia', 'Rafael', 'Sabrina', 'Thiago', 'Vanessa', 'William',
  'Juliana', 'Lucas', 'Mariana', 'Pedro', 'Renata', 'Gustavo', 'Camila', 'Rodrigo', 'Letícia', 'André',
];
const LAST = ['Souza', 'Oliveira', 'Santos', 'Lima', 'Pereira', 'Costa', 'Almeida', 'Ribeiro', 'Carvalho', 'Gomes', 'Martins', 'Rocha'];
const CITIES = ['São Paulo', 'Belo Horizonte', 'Campinas', 'Curitiba', 'Rio de Janeiro', 'Contagem', 'Santo André'];
const SOURCES: LeadSource[] = ['Meta Ads', 'Meta Ads', 'Meta Ads', 'WhatsApp', 'Instagram', 'Site', 'Indicação', 'Google'];

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function demoState(): DataState {
  const r = rng(42);
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(r() * arr.length)]!;

  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    companyName: 'Odonto Prime',
    businessType: 'Clínica / Saúde',
    onboarded: true,
  };

  const users: User[] = [
    { id: 'usr-admin', name: 'Samuel Moura', email: 'admin@demo.com', passwordHash: DEMO_PASSWORD_HASH, role: 'admin', presence: 'online', departmentIds: ['dep-comercial', 'dep-suporte'], color: '#00a389' },
    { id: 'usr-julia', name: 'Júlia Andrade', email: 'julia@demo.com', passwordHash: DEMO_PASSWORD_HASH, role: 'atendente', presence: 'online', departmentIds: ['dep-comercial'], color: '#6250d6' },
    { id: 'usr-caio', name: 'Caio Ferreira', email: 'caio@demo.com', passwordHash: DEMO_PASSWORD_HASH, role: 'atendente', presence: 'ausente', departmentIds: ['dep-comercial'], color: '#eb6834' },
    { id: 'usr-bia', name: 'Beatriz Lopes', email: 'bia@demo.com', passwordHash: DEMO_PASSWORD_HASH, role: 'supervisor', presence: 'offline', departmentIds: ['dep-suporte', 'dep-financeiro'], color: '#e87ba4' },
  ];

  const departments: Department[] = [
    { id: 'dep-comercial', name: 'Comercial', color: '#2a78d6' },
    { id: 'dep-suporte', name: 'Pós-venda', color: '#1baf7a' },
    { id: 'dep-financeiro', name: 'Financeiro', color: '#eda100' },
  ];

  const tags: Tag[] = [
    { id: 'tag-quente', name: 'Lead quente', color: '#e34948' },
    { id: 'tag-frio', name: 'Lead frio', color: '#2a78d6' },
    { id: 'tag-implante', name: 'Implante', color: '#6250d6' },
    { id: 'tag-clareamento', name: 'Clareamento', color: '#eda100' },
    { id: 'tag-orto', name: 'Ortodontia', color: '#1baf7a' },
    { id: 'tag-cliente', name: 'Cliente', color: '#008300' },
    { id: 'tag-retorno', name: 'Retorno', color: '#e87ba4' },
  ];

  const connections: Connection[] = [
    { id: 'con-principal', name: 'Comercial', phone: '5531986729542', type: 'qrcode', status: 'conectado', departmentId: 'dep-comercial', color: '#00a389', createdAt: ago(40 * D) },
    { id: 'con-oficial', name: 'Pós-venda (API oficial)', phone: '5531977776666', type: 'api_oficial', status: 'conectado', departmentId: 'dep-suporte', color: '#2a78d6', createdAt: ago(25 * D) },
  ];

  // --- Contatos (60, espalhados nos últimos 30 dias para as análises)
  const contacts: Contact[] = [];
  for (let i = 0; i < 60; i++) {
    const name = `${FIRST[i % FIRST.length]} ${pick(LAST)}`;
    const createdMs = i < 14 ? r() * 3 * D : r() * 30 * D;
    const tagPool = ['tag-implante', 'tag-clareamento', 'tag-orto'];
    contacts.push({
      id: `ctt-${i + 1}`,
      name,
      phone: `55319${Math.floor(80000000 + r() * 19999999)}`,
      email: r() > 0.4 ? `${name.split(' ')[0]!.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}${i}@email.com` : undefined,
      city: pick(CITIES),
      source: pick(SOURCES),
      tagIds: [pick(tagPool), ...(r() > 0.7 ? ['tag-quente'] : r() > 0.8 ? ['tag-frio'] : [])],
      ownerId: pick(['usr-julia', 'usr-caio', 'usr-admin']),
      createdAt: ago(createdMs),
      color: pickColor(name),
    });
  }

  // --- Conversas com roteiro
  type Line = [dir: 'in' | 'out' | 'note', text: string, minutesAgo: number, author?: string, kind?: Message['kind']];
  const scripts: { c: number; status: Conversation['status']; assignee?: string; ai?: boolean; unread?: number; lines: Line[] }[] = [
    {
      c: 0, status: 'aguardando', unread: 2,
      lines: [
        ['in', 'Oi! Vi o anúncio de vocês no Instagram sobre implante', 14],
        ['in', 'Queria saber o valor e se parcela', 13],
      ],
    },
    {
      c: 1, status: 'em_atendimento', assignee: 'usr-admin', unread: 1,
      lines: [
        ['in', 'Boa tarde, vocês fazem clareamento a laser?', 95],
        ['out', 'Boa tarde, Bruno! Fazemos sim 😊 Temos o clareamento a laser em consultório e o caseiro com moldeira.', 92, 'usr-admin'],
        ['in', 'Qual a diferença de preço?', 90],
        ['out', 'O de consultório sai R$ 890 em 2 sessões e o caseiro R$ 590. Ambos parcelam em até 10x sem juros.', 88, 'usr-admin'],
        ['note', 'Paciente comentou que tem sensibilidade — avaliar antes de fechar.', 87, 'usr-admin'],
        ['in', 'Show! Tem horário essa semana pra avaliação?', 3],
      ],
    },
    {
      c: 2, status: 'em_atendimento', ai: true, unread: 0,
      lines: [
        ['in', 'Olá, quero informações sobre aparelho ortodôntico', 40],
        ['out', 'Olá, Carla! Eu sou a Lia, assistente virtual da Odonto Prime 💙 Posso te ajudar com isso!', 40, 'ai'],
        ['out', 'Você procura aparelho fixo tradicional ou alinhador invisível?', 39, 'ai'],
        ['in', 'Invisível. Quanto custa mais ou menos?', 30],
        ['out', 'O alinhador invisível começa em R$ 6.900, com parcelamento em até 18x. O valor exato depende da avaliação, que é gratuita. Quer agendar?', 29, 'ai'],
      ],
    },
    {
      c: 3, status: 'em_atendimento', assignee: 'usr-julia', unread: 0,
      lines: [
        ['in', 'Bom dia! Minha consulta é amanhã às 10h né?', 300],
        ['out', 'Bom dia, Diego! Isso mesmo, amanhã às 10h com a Dra. Paula. Confirmo sua presença?', 290, 'usr-julia'],
        ['in', 'Confirmado 👍', 285],
        ['out', 'Perfeito! Até amanhã 😉', 284, 'usr-julia'],
      ],
    },
    {
      c: 4, status: 'aguardando', unread: 1,
      lines: [['in', 'Vocês atendem convênio?', 6]],
    },
    {
      c: 5, status: 'em_atendimento', assignee: 'usr-caio', unread: 0,
      lines: [
        ['in', 'Recebi o orçamento, achei um pouco alto', 1500],
        ['out', 'Entendo, Felipe! Consigo condicionar em 12x sem juros e ainda incluir a limpeza. Ajuda?', 1480, 'usr-caio'],
      ],
    },
    {
      c: 6, status: 'em_atendimento', ai: true, unread: 0,
      lines: [
        ['in', 'Qual o endereço da clínica?', 180],
        ['out', 'Estamos na Av. do Contorno, 4520 — Funcionários, BH. Temos estacionamento conveniado ao lado 🚗', 180, 'ai'],
        ['in', 'Obrigada!', 170],
      ],
    },
    {
      c: 7, status: 'finalizado', assignee: 'usr-julia', unread: 0,
      lines: [
        ['in', 'Consegui pagar pelo pix, segue comprovante', 2 * 1440],
        ['in', 'comprovante.pdf', 2 * 1440 - 1, undefined, 'document'],
        ['out', 'Recebido, Henrique! Obrigada 💚 Seu tratamento está confirmado.', 2 * 1440 - 10, 'usr-julia'],
      ],
    },
    {
      c: 8, status: 'aguardando', unread: 3,
      lines: [
        ['in', 'Oii', 25],
        ['in', 'Quero marcar uma avaliação pra implante', 24],
        ['in', 'Pode ser sábado?', 24],
      ],
    },
    {
      c: 9, status: 'em_atendimento', assignee: 'usr-admin', unread: 0,
      lines: [
        ['in', 'Áudio', 60 * 26, undefined, 'audio'],
        ['out', 'Oi João! Ouvi seu áudio. Vou te passar as opções de horário para a manutenção.', 60 * 26 - 5, 'usr-admin'],
      ],
    },
    {
      c: 10, status: 'finalizado', assignee: 'usr-caio', unread: 0,
      lines: [
        ['in', 'Muito obrigada pelo atendimento, amei o resultado!', 4 * 1440],
        ['out', 'Que alegria, Larissa! Se puder, deixa uma avaliação pra gente no Google 🙏', 4 * 1440 - 30, 'usr-caio'],
      ],
    },
    {
      c: 11, status: 'em_atendimento', assignee: 'usr-julia', unread: 0,
      lines: [
        ['in', 'Tem como enviar a proposta por e-mail?', 600],
        ['out', 'Claro, Marcos! Acabei de enviar para o seu e-mail. Qualquer dúvida me chama aqui.', 590, 'usr-julia'],
      ],
    },
  ];

  const conversations: Conversation[] = [];
  const messages: Message[] = [];
  scripts.forEach((s, idx) => {
    const contact = contacts[s.c]!;
    const convId = `cnv-${idx + 1}`;
    let last = '';
    s.lines.forEach(([dir, text, min, author, kind], j) => {
      const isNote = dir === 'note';
      const createdAt = ago(min * 60_000);
      last = createdAt;
      messages.push({
        id: `msg-${idx + 1}-${j + 1}`,
        conversationId: convId,
        direction: dir === 'in' ? 'in' : 'out',
        kind: isNote ? 'note' : (kind ?? 'text'),
        body: text,
        author: dir === 'in' ? 'contact' : (author ?? 'system'),
        createdAt,
        status: 'read',
        fileName: kind === 'document' ? text : undefined,
      });
    });
    conversations.push({
      id: convId,
      contactId: contact.id,
      connectionId: idx % 4 === 3 ? 'con-oficial' : 'con-principal',
      status: s.status,
      assigneeId: s.assignee,
      departmentId: idx % 4 === 3 ? 'dep-suporte' : 'dep-comercial',
      aiEnabled: !!s.ai,
      agentId: s.ai ? 'agt-lia' : undefined,
      unread: s.unread ?? 0,
      pinned: idx === 1,
      lastMessageAt: last,
      aiReplies: s.ai ? 2 : 0,
    });
  });

  const products: Product[] = [
    { id: 'prd-implante', name: 'Implante dentário unitário', sku: 'IMP-001', category: 'Implantodontia', price: 3800, description: 'Implante de titânio + coroa em porcelana.', active: true },
    { id: 'prd-protocolo', name: 'Protocolo sobre implantes', sku: 'IMP-010', category: 'Implantodontia', price: 24000, description: 'Prótese fixa total sobre 4 a 6 implantes.', active: true },
    { id: 'prd-clareamento-lz', name: 'Clareamento a laser', sku: 'EST-001', category: 'Estética', price: 890, description: '2 sessões em consultório.', active: true },
    { id: 'prd-clareamento-cs', name: 'Clareamento caseiro', sku: 'EST-002', category: 'Estética', price: 590, description: 'Moldeiras personalizadas + gel por 21 dias.', active: true },
    { id: 'prd-lente', name: 'Lente de contato dental (unid.)', sku: 'EST-010', category: 'Estética', price: 1600, description: 'Faceta ultrafina em porcelana.', active: true },
    { id: 'prd-alinhador', name: 'Alinhador invisível', sku: 'ORT-002', category: 'Ortodontia', price: 6900, description: 'Tratamento completo com alinhadores.', active: true },
    { id: 'prd-aparelho', name: 'Aparelho fixo estético', sku: 'ORT-001', category: 'Ortodontia', price: 2400, description: 'Braquetes de safira + manutenções mensais.', active: true },
    { id: 'prd-limpeza', name: 'Limpeza e profilaxia', sku: 'CLI-001', category: 'Clínico geral', price: 220, description: 'Profilaxia completa com flúor.', active: true },
  ];

  const pipelines: Pipeline[] = [
    defaultPipeline(),
    {
      id: 'pip-posvenda',
      name: 'Pós-venda e retorno',
      stages: [
        { id: 'stg-pv-agendar', name: 'Agendar retorno', color: '#86b6ef', probability: 20 },
        { id: 'stg-pv-agendado', name: 'Retorno agendado', color: '#3987e5', probability: 60 },
        { id: 'stg-pv-concluido', name: 'Concluído', color: '#184f95', probability: 100 },
      ],
    },
  ];

  const stageIds = pipelines[0]!.stages.map((s) => s.id);
  const deals: Deal[] = [];
  for (let i = 0; i < 26; i++) {
    const contact = contacts[i]!;
    const product = pick(products);
    const statusRoll = r();
    const status: Deal['status'] = i > 18 ? (statusRoll > 0.45 ? 'ganho' : 'perdido') : 'aberto';
    const created = ago(r() * 28 * D);
    deals.push({
      id: `dea-${i + 1}`,
      pipelineId: 'pip-vendas',
      stageId: status === 'aberto' ? stageIds[Math.min(stageIds.length - 1, Math.floor(r() * (i < 6 ? 2 : 5)))]! : stageIds[4]!,
      contactId: contact.id,
      title: product.name,
      value: product.price * (product.id === 'prd-lente' ? 6 : 1),
      ownerId: contact.ownerId,
      productIds: [product.id],
      status,
      lostReason: status === 'perdido' ? pick(['Preço', 'Escolheu concorrente', 'Sem retorno']) : undefined,
      expectedClose: ahead(r() * 20 * D),
      createdAt: created,
      updatedAt: status === 'aberto' ? created : ago(r() * 10 * D),
    });
  }
  deals.push(
    { id: 'dea-pv-1', pipelineId: 'pip-posvenda', stageId: 'stg-pv-agendar', contactId: contacts[7]!.id, title: 'Retorno 30 dias', value: 0, ownerId: 'usr-julia', productIds: [], status: 'aberto', createdAt: ago(3 * D), updatedAt: ago(3 * D) },
    { id: 'dea-pv-2', pipelineId: 'pip-posvenda', stageId: 'stg-pv-agendado', contactId: contacts[10]!.id, title: 'Manutenção semestral', value: 220, ownerId: 'usr-caio', productIds: ['prd-limpeza'], status: 'aberto', createdAt: ago(6 * D), updatedAt: ago(2 * D) },
  );

  const tasks: Task[] = [
    { id: 'tsk-1', title: 'Ligar para Bruno sobre avaliação', type: 'ligacao', priority: 'alta', dueAt: ago(2 * H), done: false, contactId: contacts[1]!.id, assigneeId: 'usr-admin', createdAt: ago(D) },
    { id: 'tsk-2', title: 'Enviar proposta de alinhador para Carla', type: 'whatsapp', priority: 'alta', dueAt: ahead(3 * H), done: false, contactId: contacts[2]!.id, assigneeId: 'usr-julia', createdAt: ago(5 * H) },
    { id: 'tsk-3', title: 'Confirmar consulta do Diego', type: 'whatsapp', priority: 'media', dueAt: ahead(20 * H), done: false, contactId: contacts[3]!.id, assigneeId: 'usr-julia', createdAt: ago(D) },
    { id: 'tsk-4', title: 'Negociar condição com Felipe', type: 'reuniao', priority: 'media', dueAt: ahead(2 * D), done: false, contactId: contacts[5]!.id, assigneeId: 'usr-caio', createdAt: ago(D) },
    { id: 'tsk-5', title: 'Pedir avaliação no Google para Larissa', type: 'whatsapp', priority: 'baixa', dueAt: ago(D), done: true, contactId: contacts[10]!.id, assigneeId: 'usr-caio', createdAt: ago(4 * D) },
    { id: 'tsk-6', title: 'Revisar campanhas do Meta Ads', type: 'outro', priority: 'media', dueAt: ahead(4 * D), done: false, assigneeId: 'usr-admin', createdAt: ago(2 * D) },
    { id: 'tsk-7', title: 'Retornar e-mail do Marcos', type: 'email', priority: 'baixa', dueAt: ago(26 * H), done: false, contactId: contacts[11]!.id, assigneeId: 'usr-julia', createdAt: ago(2 * D) },
  ];

  const knowledge: KnowledgeItem[] = [
    { id: 'kb-endereco', type: 'faq', title: 'Qual o endereço da clínica?', content: 'Estamos na Av. do Contorno, 4520 — Funcionários, Belo Horizonte. Temos estacionamento conveniado ao lado.', updatedAt: ago(10 * D) },
    { id: 'kb-horario', type: 'faq', title: 'Qual o horário de funcionamento?', content: 'Atendemos de segunda a sexta, das 8h às 19h, e aos sábados das 8h às 12h.', updatedAt: ago(10 * D) },
    { id: 'kb-convenio', type: 'faq', title: 'Vocês atendem convênio?', content: 'Atendemos os convênios Odontoprev, Amil Dental e SulAmérica Odonto. Para tratamentos estéticos, trabalhamos com parcelamento em até 18x.', updatedAt: ago(7 * D) },
    { id: 'kb-parcelamento', type: 'faq', title: 'Formas de pagamento e parcelamento', content: 'Aceitamos Pix, cartão de débito e crédito em até 18x, e boleto. Pagamento à vista no Pix tem 5% de desconto.', updatedAt: ago(5 * D) },
    { id: 'kb-avaliacao', type: 'faq', title: 'A avaliação é gratuita?', content: 'Sim! A primeira avaliação é gratuita e dura cerca de 30 minutos, com radiografia digital inclusa.', updatedAt: ago(5 * D) },
    { id: 'kb-precos', type: 'texto', title: 'Tabela de preços de referência', content: 'Implante unitário a partir de R$ 3.800. Clareamento a laser R$ 890. Clareamento caseiro R$ 590. Alinhador invisível a partir de R$ 6.900. Aparelho fixo estético R$ 2.400. Limpeza R$ 220. Valores finais dependem da avaliação.', updatedAt: ago(3 * D) },
    { id: 'kb-site', type: 'url', title: 'Site institucional', content: 'https://odontoprime.exemplo.com.br', updatedAt: ago(12 * D) },
  ];

  const agents: Agent[] = [
    {
      id: 'agt-lia',
      name: 'Lia — Pré-atendimento',
      objective: 'Responder dúvidas, qualificar o lead e agendar a avaliação gratuita.',
      tone: 'amigavel',
      prompt:
        'Você é a Lia, assistente virtual da {{empresa}}. Responda em português do Brasil, com mensagens curtas (até 3 frases) e no máximo 1 emoji. Use somente as informações da base de conhecimento — nunca invente preços. Objetivo: entender o interesse do paciente e conduzir para o agendamento da avaliação gratuita. Se o paciente pedir para falar com uma pessoa, transfira imediatamente.',
      greeting: 'Olá, {{nome}}! Eu sou a Lia, assistente virtual da {{empresa}} 💙 Como posso te ajudar?',
      model: 'claude-haiku-5-5',
      temperature: 0.4,
      active: true,
      knowledgeIds: knowledge.map((k) => k.id),
      connectionIds: ['con-principal'],
      qualification: ['Qual tratamento você procura?', 'Qual o melhor dia e período para sua avaliação?'],
      maxDiscount: 5,
      schedule: { enabled: false, start: '18:00', end: '08:00', days: [0, 1, 2, 3, 4, 5, 6] },
      handoff: {
        keywords: ['atendente', 'humano', 'pessoa', 'reclamação', 'cancelar'],
        maxReplies: 8,
        departmentId: 'dep-comercial',
        message: 'Vou te transferir para um dos nossos especialistas, só um instante 🙂',
      },
      createdAt: ago(20 * D),
    },
    {
      id: 'agt-noturno',
      name: 'Plantão noturno',
      objective: 'Atender fora do horário comercial e registrar o interesse para retorno.',
      tone: 'profissional',
      prompt: 'Você atende fora do horário comercial da {{empresa}}. Colete nome, tratamento de interesse e melhor horário de contato. Informe que a equipe retornará no próximo dia útil.',
      greeting: 'Olá, {{nome}}! Nossa equipe está fora do horário agora, mas eu posso adiantar seu atendimento.',
      model: 'claude-haiku-5-5',
      temperature: 0.3,
      active: false,
      knowledgeIds: ['kb-horario', 'kb-endereco'],
      connectionIds: ['con-principal'],
      qualification: ['Qual tratamento você procura?', 'Qual o melhor horário para retornarmos?'],
      maxDiscount: 0,
      schedule: { enabled: true, start: '19:00', end: '08:00', days: [0, 1, 2, 3, 4, 5, 6] },
      handoff: { keywords: ['urgente', 'dor'], maxReplies: 6, departmentId: 'dep-comercial', message: 'Registrei seu pedido como prioridade. Um especialista vai falar com você.' },
      createdAt: ago(12 * D),
    },
  ];

  const followUps: FollowUp[] = [
    {
      id: 'fup-sem-resposta',
      name: 'Lead sem resposta',
      active: true,
      trigger: 'sem_resposta',
      stopOnReply: true,
      steps: [
        { id: 'fs-1', delayMinutes: 120, message: 'Oi {{nome}}, conseguiu ver minha última mensagem? Fico à disposição 😊' },
        { id: 'fs-2', delayMinutes: 1440, message: '{{nome}}, ainda temos horários para avaliação gratuita esta semana. Quer que eu reserve um para você?' },
        { id: 'fs-3', delayMinutes: 4320, message: 'Última chamada, {{nome}}! Se preferir, me diga o melhor momento para falarmos.' },
      ],
      sent: 184,
      replied: 61,
      createdAt: ago(30 * D),
    },
    {
      id: 'fup-pos-proposta',
      name: 'Pós-proposta',
      active: false,
      trigger: 'sem_resposta',
      stopOnReply: true,
      steps: [
        { id: 'fs-4', delayMinutes: 2880, message: '{{nome}}, ficou alguma dúvida sobre a proposta que te enviei?' },
        { id: 'fs-5', delayMinutes: 7200, message: 'Consigo manter as condições da proposta até sexta, {{nome}}. Vamos fechar?' },
      ],
      sent: 42,
      replied: 17,
      createdAt: ago(15 * D),
    },
  ];

  const quickReplies: QuickReply[] = [
    { id: 'qr-1', shortcut: 'ola', content: 'Olá {{nome}}! Tudo bem? Aqui é da {{empresa}}. Como posso te ajudar?' },
    { id: 'qr-2', shortcut: 'endereco', content: 'Estamos na Av. do Contorno, 4520 — Funcionários, BH. Estacionamento conveniado ao lado 🚗' },
    { id: 'qr-3', shortcut: 'pix', content: 'Nossa chave Pix é o CNPJ 12.345.678/0001-90 (Odonto Prime Ltda). Me envie o comprovante por aqui 🙏' },
    { id: 'qr-4', shortcut: 'avaliacao', content: 'A primeira avaliação é gratuita e dura cerca de 30 minutos. Qual o melhor dia para você?' },
    { id: 'qr-5', shortcut: 'obrigado', content: 'Nós que agradecemos, {{nome}}! Qualquer coisa é só chamar 💚' },
  ];

  const campaigns: Campaign[] = [
    { id: 'cmp-1', name: '[Leads] Implante — BH 35+', status: 'ativa', spend: 2860, impressions: 182000, clicks: 3920, leads: 142, sales: 9 },
    { id: 'cmp-2', name: '[Leads] Clareamento — Promo', status: 'ativa', spend: 1240, impressions: 121000, clicks: 2880, leads: 118, sales: 21 },
    { id: 'cmp-3', name: '[Mensagens] Alinhador invisível', status: 'ativa', spend: 1980, impressions: 98000, clicks: 1710, leads: 64, sales: 5 },
    { id: 'cmp-4', name: '[Remarketing] Visitantes do site', status: 'pausada', spend: 420, impressions: 31000, clicks: 690, leads: 22, sales: 3 },
    { id: 'cmp-5', name: '[Leads] Lentes de contato', status: 'pausada', spend: 1510, impressions: 76000, clicks: 1180, leads: 37, sales: 2 },
  ];

  const notifications: Notification[] = [
    { id: 'ntf-1', title: 'Novo lead do Meta Ads', body: `${contacts[0]!.name} chegou pela campanha de implante.`, createdAt: ago(14 * 60_000), read: false, link: '/inbox/cnv-1' },
    { id: 'ntf-2', title: 'Tarefa atrasada', body: 'Ligar para Bruno sobre avaliação', createdAt: ago(2 * H), read: false, link: '/tarefas' },
    { id: 'ntf-3', title: 'IA transferiu um atendimento', body: 'Lia transferiu uma conversa para o Comercial.', createdAt: ago(D), read: true, link: '/inbox' },
  ];

  const customFields: CustomField[] = [
    { id: 'cf-convenio', name: 'Convênio', type: 'lista', options: ['Particular', 'Odontoprev', 'Amil Dental', 'SulAmérica Odonto'] },
    { id: 'cf-nascimento', name: 'Data de nascimento', type: 'data', options: [] },
    { id: 'cf-indicacao', name: 'Indicado por', type: 'texto', options: [] },
  ];
  contacts[1]!.customFields = { 'cf-convenio': 'Particular', 'cf-nascimento': '1991-04-12' };
  contacts[2]!.customFields = { 'cf-convenio': 'Amil Dental', 'cf-indicacao': 'Instagram da Dra. Paula' };
  contacts[4]!.customFields = { 'cf-convenio': 'Odontoprev' };

  const chatbots: ChatbotFlow[] = [
    {
      id: 'bot-posvenda',
      name: 'Menu do pós-venda',
      active: true,
      connectionIds: ['con-oficial'],
      trigger: 'primeira_mensagem',
      keywords: ['menu'],
      greeting: 'Olá, {{nome}}! Bem-vindo(a) ao pós-venda da {{empresa}} 💙 Digite o número da opção:',
      options: [
        { id: 'bo-1', key: '1', label: 'Agendar retorno ou manutenção', reply: 'Perfeito! Vou te colocar na agenda de retornos. Um atendente confirma o horário em instantes.', action: 'funil', value: 'stg-pv-agendar' },
        { id: 'bo-2', key: '2', label: 'Financeiro e boletos', reply: 'Certo! Vou te transferir para o Financeiro.', action: 'transferir', value: 'dep-financeiro' },
        { id: 'bo-3', key: '3', label: 'Tirar dúvidas com a assistente virtual', reply: '', action: 'ia', value: 'agt-lia' },
        { id: 'bo-4', key: '4', label: 'Falar com um atendente', reply: 'Já vou te passar para alguém da equipe, só um instante 🙂', action: 'transferir', value: 'dep-suporte' },
      ],
      invalidMessage: 'Não entendi 🤔 Responda só com o número da opção, por favor.',
      runs: 37,
      createdAt: ago(18 * D),
    },
  ];

  const broadcasts: Broadcast[] = [
    {
      id: 'brd-outubro',
      name: 'Promoção de clareamento — outubro',
      connectionId: 'con-principal',
      message: 'Oi {{nome}}! Em outubro o clareamento a laser está com 15% de desconto na {{empresa}}. Quer garantir seu horário? 😁',
      audience: { tagIds: ['tag-clareamento'], sources: [], stageIds: [] },
      recipients: contacts.filter((c) => c.tagIds.includes('tag-clareamento')).map((c) => c.id),
      intervalSec: 20,
      status: 'concluido',
      sent: contacts.filter((c) => c.tagIds.includes('tag-clareamento')).length,
      replied: 7,
      createdAt: ago(9 * D),
      startedAt: ago(8 * D),
      finishedAt: ago(8 * D - 40 * 60_000),
    },
    {
      id: 'brd-retorno',
      name: 'Lembrete de manutenção semestral',
      connectionId: 'con-oficial',
      message: 'Olá {{nome}}, já faz 6 meses da sua última limpeza. Vamos agendar a manutenção? Responda SIM que a gente reserva um horário.',
      audience: { tagIds: ['tag-cliente'], sources: [], stageIds: [] },
      recipients: [],
      intervalSec: 30,
      status: 'rascunho',
      sent: 0,
      replied: 0,
      createdAt: ago(2 * D),
    },
  ];

  const scheduled: ScheduledMessage[] = [
    {
      id: 'sch-1',
      conversationId: 'cnv-4',
      body: 'Bom dia, Diego! Passando para lembrar da sua consulta hoje às 10h 😉',
      sendAt: ahead(18 * H),
      status: 'pendente',
      createdBy: 'usr-julia',
      createdAt: ago(4 * H),
    },
  ];

  return {
    settings,
    users,
    departments,
    tags,
    contacts,
    conversations,
    messages,
    pipelines,
    deals,
    tasks,
    products,
    agents,
    knowledge,
    followUps,
    connections,
    quickReplies,
    campaigns,
    notifications,
    broadcasts,
    scheduled,
    chatbots,
    customFields,
  };
}
