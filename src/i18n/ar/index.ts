// Arabic storefront dictionary: the source of truth for every shopper-facing string.
// src/i18n/en/index.ts must match its shape (enforced by the `Dictionary` type).
import { arClient } from "./client";

function arabicCount(n: number, one: string, two: string, few: string, many: string) {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}

export const ar = {
  ...arClient,

  meta: {
    siteDescription: "بطاقات ألعاب، اشتراكات، حسابات وخدمات رقمية — تسليم فوري.",
    notFound: "الصفحة غير موجودة",
  },

  common: {
    home: "الرئيسية",
    breadcrumb: "مسار التنقل",
    search: "البحث",
    contact: "تواصل معنا",
    backHome: "العودة للرئيسية",
    loading: "جارٍ التحميل",
    products: (n: number): string => (n === 1 ? "منتج" : "منتجات"),
    /** "48" → "يومان", "72" → "3 أيام", "12" → "12 ساعة". */
    warranty: (hours: number) =>
      hours >= 24 && hours % 24 === 0
        ? arabicCount(hours / 24, "يوم واحد", "يومان", "أيام", "يوماً")
        : arabicCount(hours, "ساعة واحدة", "ساعتان", "ساعات", "ساعة"),
    /** "12 تقييماً" with Arabic plural forms. */
    reviewCount: (n: number) => {
      if (n === 1) return "تقييم واحد";
      if (n === 2) return "تقييمان";
      if (n >= 3 && n <= 10) return `${n} تقييمات`;
      return `${n} تقييماً`;
    },
    minutes: (seconds: number) => {
      const m = Math.max(1, Math.ceil(seconds / 60));
      return m === 1 ? "دقيقة" : m === 2 ? "دقيقتين" : m <= 10 ? `${m} دقائق` : `${m} دقيقة`;
    },
    /** Public reviewer name when the email gives nothing to show. */
    customer: "عميل",
  },

  shell: {
    skip: "تخطَّ إلى المحتوى",
  },

  headerNav: {
    search: "البحث",
    account: "حسابي",
    signIn: "تسجيل الدخول",
    accountBalance: (balance: string) => `حسابي — رصيد المحفظة ${balance}`,
    logoHome: "Nitro Store — الرئيسية",
  },

  footer: {
    help: "المساعدة",
    faq: "الأسئلة الشائعة",
    contact: "تواصل معنا",
    support: "تذاكر الدعم",
    cart: "سلة المشتريات",
    policies: "السياسات",
    terms: "الشروط والأحكام",
    refund: "سياسة الاسترجاع",
    tagline: "بطاقات ألعاب، اشتراكات، حسابات وخدمات رقمية — دفع آمن وتسليم فوري للأكواد على مدار الساعة.",
    instant: "تسليم فوري",
    encrypted: "دفع مشفّر",
    warranty: "ضمان الحسابات",
    support247: "دعم 24/7",
    rights: "جميع الحقوق محفوظة.",
    preferences: "اللغة والعملة",
  },

  orderStatus: {
    PENDING: "بانتظار الدفع",
    PAID: "مدفوع - بانتظار التسليم",
    FULFILLED: "تم التسليم",
    FAILED: "فشل",
    REFUNDED: "مسترجع",
  },

  ticketStatus: {
    OPEN: "بانتظار الرد",
    ANSWERED: "تم الرد",
    CLOSED: "مغلقة",
  },

  home: {
    categoriesTitle: "تصفّح الأقسام",
    categoriesText: "اختر القسم وابدأ — كل المنتجات رقمية وتصلك بدون شحن أو انتظار.",
    emptyTitle: "المتجر يجهّز منتجاته",
    emptyText: "نضيف المنتجات حالياً، عد قريباً أو تواصل معنا إن كنت تبحث عن شيء محدد.",
    featuredTitle: "الأكثر طلباً",
    featuredText: "منتجات مختارة يطلبها لاعبونا باستمرار.",
    live: "التسليم يعمل الآن — على مدار الساعة",
    heroLine1: "أكوادك تصلك",
    heroLine2: "في ثوانٍ.",
    heroText:
      "بطاقات هدايا الألعاب، الاشتراكات، الحسابات الجاهزة والخدمات الرقمية. ادفع بأمان واستلم طلبك فوراً على صفحة طلبك — بدون حسابات ولا انتظار.",
    shopNow: "تسوّق الآن",
    howItWorks: "كيف يعمل؟",
    stats: [
      { k: "تسليم", v: "فوري" },
      { k: "دفع", v: "آمن" },
      { k: "دعم", v: "24/7" },
    ],
    delivered: "تم التسليم",
    copy: "نسخ",
    trustLabel: "لماذا Nitro Store",
    trust: [
      { title: "تسليم فوري", text: "الأكواد تظهر مباشرة بعد تأكيد الدفع" },
      { title: "دفع آمن ومشفّر", text: "لا نخزّن بيانات بطاقتك إطلاقاً" },
      { title: "ضمان على الحسابات", text: "استبدال أو استرجاع خلال مدة الضمان" },
      { title: "دعم 24/7", text: "فريقنا جاهز لمساعدتك في أي وقت" },
    ],
    stepsTitle: "ثلاث خطوات فقط",
    steps: [
      { title: "اختر", text: "اختر المنتج والفئة التي تناسبك، وأضفها إلى السلة." },
      { title: "ادفع", text: "أدخل بريدك الإلكتروني وادفع عبر بوابة دفع آمنة ومشفّرة." },
      { title: "استلم فوراً", text: "يظهر الكود على صفحة طلبك فور تأكيد الدفع، ونرسل لك رابطها بالبريد." },
    ],
  },

  category: {
    notFound: "القسم غير موجود",
    metaDescription: (name: string) => `تسوّق ${name} من Nitro Store — دفع آمن وتسليم فوري على مدار الساعة.`,
    sorts: { newest: "الأحدث", "price-asc": "السعر: من الأقل", "price-desc": "السعر: من الأعلى" },
    sortLabel: "ترتيب المنتجات",
    emptyTitle: "لا توجد منتجات في هذا القسم حالياً",
    emptyText: "نضيف منتجات جديدة باستمرار. تصفّح بقية الأقسام أو ابحث عن منتج محدد.",
  },

  search: {
    metaTitle: (q: string) => `نتائج البحث عن "${q}"`,
    title: "البحث",
    resultsTitle: "نتائج البحث",
    searchTitle: "ابحث في المتجر",
    resultWord: (n: number): string => (n === 1 ? "نتيجة" : "نتائج"),
    for: "لـ",
    quoteOpen: "«",
    quoteClose: "»",
    browse: "أو تصفّح الأقسام:",
    emptyTitle: "لم نجد ما تبحث عنه",
    emptyText: "جرّب كلمة أبسط أو اسم اللعبة أو المنصة بالإنجليزية، أو تواصل معنا وسنوفّره لك.",
    browseStore: "تصفّح المتجر",
  },

  productCard: {
    rating: (avg: string, count: string) => `التقييم ${avg} من 5، ${count}`,
    from: "يبدأ من",
  },

  product: {
    notFound: "المنتج غير موجود",
    metaDescription: (name: string) => `اشترِ ${name} من Nitro Store — دفع آمن وتسليم فوري على مدار الساعة.`,
    manualTitle: "تسليم يدوي",
    manualText: "ينفّذ فريقنا الخدمة بعد الدفع ونحدّث صفحة طلبك فور الانتهاء.",
    instantTitle: "تسليم فوري",
    instantText: "يظهر المنتج على صفحة طلبك فور تأكيد الدفع.",
    warrantyTitle: (w: string) => `ضمان ${w}`,
    warrantyText: "يبدأ من لحظة التسليم؛ نستبدل الحساب أو نعيد المبلغ إن لم يعمل كما هو موصوف.",
    secureTitle: "دفع آمن",
    secureText: "بوابة دفع مشفّرة، ولا نخزّن بيانات بطاقتك.",
    supportTitle: "دعم 24/7",
    supportText: "تواجه مشكلة؟ تواصل معنا وسنساعدك بسرعة.",
    manualBadge: "يُسلَّم يدوياً",
    unavailable: "هذا المنتج غير متاح للشراء حالياً.",
    description: "الوصف",
    reviewsTitle: "تقييمات العملاء",
    reviewsText: "تقييمات من مشترين موثّقين استلموا طلباتهم.",
    noReviewsTitle: "لا توجد تقييمات بعد",
    noReviewsText: "بعد استلام طلبك يمكنك تقييم المنتج من صفحة الطلب، وسيظهر تقييمك هنا بعد المراجعة.",
    moreFrom: (name: string) => `المزيد من ${name}`,
    viewAll: "عرض الكل",
    distribution: "توزيع التقييمات",
    starsCount: (stars: number, n: number) => `${stars} نجوم: ${n}`,
  },

  cartPage: {
    title: "سلة المشتريات",
    providers: { STRIPE: "بطاقة دولية (Stripe)", TAP: "بطاقة / مدى / Apple Pay (Tap)" },
  },

  order: {
    metaTitle: "تفاصيل الطلب",
    status: {
      PENDING: {
        title: "بانتظار تأكيد الدفع",
        text: "نتحقق من عملية الدفع الآن. ستتحدّث هذه الصفحة تلقائياً فور التأكيد.",
      },
      PAID: {
        title: "تم الدفع بنجاح",
        text: "جاري تجهيز طلبك وسيصلك قريباً.",
      },
      FULFILLED: {
        title: "تم تسليم طلبك",
        text: "منتجاتك جاهزة أدناه. انسخها واحتفظ بها في مكان آمن.",
      },
      FAILED: {
        title: "لم تكتمل عملية الدفع",
        text: "لم يكتمل الدفع لهذا الطلب. يمكنك المحاولة مجدداً من السلة، وإن تم خصم المبلغ تواصل معنا.",
      },
      REFUNDED: {
        title: "تم استرجاع المبلغ",
        text: "تم استرجاع مبلغ هذا الطلب. للاستفسار تواصل مع الدعم مع ذكر رقم الطلب.",
      },
    },
    reviewStatus: { PENDING: "بانتظار المراجعة", APPROVED: "منشور", REJECTED: "غير منشور" },
    date: "تاريخ الطلب",
    total: "الإجمالي",
    email: "البريد الإلكتروني",
    bookmark: "احفظ هذه الصفحة في المفضلة.",
    bookmarkDelivered: "أرسلنا رابطها أيضاً إلى بريدك الإلكتروني، ويمكنك العودة إليها في أي وقت لعرض منتجاتك.",
    bookmarkPending: "سنرسل رابطها إلى بريدك الإلكتروني فور اكتمال التسليم، ويمكنك العودة إليها في أي وقت.",
    private: "الرابط خاص بك — لا تشاركه مع أحد.",
    items: "المنتجات",
    quantity: "الكمية:",
    deliveryDetails: "تفاصيل التسليم",
    deliveryNote: "ملاحظة التسليم",
    itemDelivered: "تم تسليم هذا المنتج.",
    preparing: "جاري تجهيز طلبك وسيصلك قريباً",
    appearsAfterPayment: "سيظهر المنتج هنا فور تأكيد الدفع.",
    warrantyActive: "الضمان ساري",
    warrantyEnded: "انتهى الضمان",
    until: "حتى",
    at: "في",
    yourReview: "تقييمك",
    viewOnProduct: "عرض في صفحة المنتج",
    paymentSummary: "ملخص الدفع",
    subtotal: "المجموع الفرعي",
    discount: "الخصم",
    paidFromWallet: "مدفوع من رصيد المحفظة",
    paidByCard: "مدفوع بالبطاقة",
    problem: "تواجه مشكلة في طلبك؟ افتح تذكرة دعم مرتبطة بالطلب",
    contactSupport: "تواصل مع الدعم بخصوص هذا الطلب",
    backToCart: "العودة إلى السلة",
    continueShopping: "متابعة التسوّق",
    secretAccount: "بيانات الحساب",
    secretSubscription: "كود الاشتراك",
    secretCode: "الكود",
    secretError: "تعذّر عرض هذا العنصر. تواصل مع الدعم وسنرسله لك فوراً.",
    delivered: "تم التسليم",
    inProgress: "قيد التجهيز",
    steps: ["تم إنشاء الطلب", "تم الدفع", "تم التسليم"],
    stepsLabel: "مراحل الطلب",
  },

  account: {
    metaTitle: "حسابي",
    title: "حسابي",
    memberSince: "عضو منذ",
    tickets: "تذاكر الدعم",
    newReplies: "تذاكر فيها رد جديد من الدعم",
    signOut: "تسجيل الخروج",
    topupCancelled: "أُلغيت عملية الشحن.",
    topupCancelledText: "لم يُخصم أي مبلغ، ويمكنك المحاولة مجدداً في أي وقت.",
    walletBalance: "رصيد المحفظة",
    walletHint: "استخدم رصيدك عند الدفع من السلة بتفعيل خيار «استخدم رصيد المحفظة»، ويُستكمل أي فرق بالبطاقة.",
    orders: "الطلبات",
    walletMoves: "حركات المحفظة",
    topupTitle: "شحن الرصيد",
    topupText: "أضف رصيداً لمحفظتك واستخدمه في مشترياتك القادمة.",
    myOrders: "طلباتي",
    orderWord: "طلب",
    noOrdersPage: "لا توجد طلبات في هذه الصفحة",
    noOrders: "لا توجد طلبات بعد",
    noOrdersText: "كل طلب تُتمّه بهذا البريد يظهر هنا مع منتجاته.",
    firstPage: "العودة لأول صفحة",
    startShopping: "ابدأ التسوّق",
    more: (n: number) => ` و${n} أخرى`,
    ordersPages: "صفحات الطلبات",
    walletHistory: "سجل المحفظة",
    noMovesPage: "لا توجد حركات في هذه الصفحة",
    noMoves: "لا توجد حركات بعد",
    noMovesText: "تظهر هنا عمليات الشحن والدفع والاسترجاع الخاصة بمحفظتك.",
    tx: {
      TOPUP: "شحن رصيد",
      PURCHASE: "دفع طلب من المحفظة",
      REFUND: "استرجاع إلى المحفظة",
      ADJUSTMENT: "تعديل من الإدارة",
    },
    referralReward: "مكافأة إحالة",
    order: "طلب",
    balance: "الرصيد",
    walletPages: "صفحات سجل المحفظة",
    hide: "إخفاء",
    topupPending: "نؤكد عملية الدفع الآن.",
    willAdd: "سيُضاف",
    toBalanceSoon: "إلى رصيدك خلال لحظات.",
    topupFailed: "لم تكتمل عملية الشحن.",
    topupFailedText: "لم يُضف أي رصيد؛ إن خُصم المبلغ تواصل مع الدعم.",
    topupOk: "تم شحن رصيدك بنجاح.",
    added: "أُضيف",
    toWallet: "إلى محفظتك.",
    willShow: "سيظهر الرصيد في محفظتك.",
  },

  referral: {
    share: (link: string) => `تسوّق بطاقات الألعاب والاشتراكات من Nitro Store بتسليم فوري: ${link}`,
    invited: "أصدقاء دعوتهم",
    rewarded: "مكافآت مستحقة",
    earned: "إجمالي الأرباح",
    title: "ادعُ أصدقاءك",
    paused: "برنامج الإحالة متوقف مؤقتاً.",
    whatsapp: "مشاركة عبر واتساب",
    pending: "مكافأة بانتظار تسليم طلب صديقك.",
    /** One-line rule, e.g. "تحصل على 10% من قيمة أول طلب يدفعه صديقك (حتى $5.00)…". */
    rule: (r: { percent: number | null; fixed: string | null; max: string | null; min: string | null }) => {
      const reward =
        r.percent !== null
          ? `${r.percent}% من قيمة أول طلب يدفعه صديقك${r.max ? ` (حتى ${r.max})` : ""}`
          : `${r.fixed} عن أول طلب يدفعه صديقك`;
      const min = r.min ? ` بشرط ألا تقل قيمة الطلب عن ${r.min}` : "";
      return `تحصل على ${reward}${min}، تُضاف إلى محفظتك بعد تسليم طلبه.`;
    },
  },

  login: {
    metaTitle: "تسجيل الدخول",
    perks: ["كل طلباتك ومنتجاتك في مكان واحد", "محفظة رصيد للدفع بضغطة واحدة", "إتمام أسرع للطلبات القادمة"],
    heading: "حسابك في Nitro Store",
    intro:
      "لا حاجة لكلمة مرور: أدخل بريدك وسنرسل لك رمز دخول صالحاً لمدة 10 دقائق. إن لم يكن لديك حساب فسننشئه تلقائياً بنفس البريد الذي تستلم عليه طلباتك.",
    title: "تسجيل الدخول",
    errors: {
      emailRequired: "أدخل بريدك الإلكتروني.",
      emailTooLong: "البريد الإلكتروني طويل جداً.",
      emailInvalid: "صيغة البريد الإلكتروني غير صحيحة.",
      emailFallback: "البريد غير صالح.",
      tooManySends: (wait: string) => `طلبات كثيرة من جهازك. حاول مجدداً بعد ${wait}.`,
      emailFirst: "أدخل بريدك الإلكتروني أولاً.",
      codeLength: "أدخل الرمز المكوّن من 6 أرقام.",
      tooManyTries: (wait: string) => `محاولات كثيرة. حاول مجدداً بعد ${wait}.`,
      badRequest: "طلب غير صالح.",
      tooManyCodes: "طلبت رموزاً كثيرة. انتظر بضع دقائق ثم حاول مجدداً.",
      sendFailed: "تعذّر إرسال الرمز. حاول مرة أخرى بعد قليل.",
      invalidCode: "الرمز غير صحيح أو منتهي الصلاحية.",
    },
  },

  review: {
    chooseStars: "اختر عدد النجوم.",
    commentTooLong: (max: number) => `التعليق أطول من ${max} حرف.`,
    nameTooShort: "اكتب اسماً من حرفين على الأقل.",
    nameTooLong: (max: number) => `الاسم طويل جداً (${max} حرفاً كحد أقصى).`,
    verifyFailed: "تعذّر التحقق من الطلب. حدّث الصفحة وحاول مجدداً.",
    notReviewable: "لا يمكن تقييم منتجات هذا الطلب.",
    notInOrder: "هذا المنتج ليس ضمن الطلب.",
    notDelivered: "يمكنك تقييم المنتج بعد استلامه.",
    already: "قيّمت هذا المنتج من قبل. شكراً لك!",
    thanks: "شكراً! سيظهر تقييمك بعد المراجعة",
  },

  support: {
    metaTitle: "الدعم الفني",
    metaDescription: "افتح تذكرة دعم وتابع ردود فريق Nitro Store.",
    orderFallback: "طلب",
    title: "الدعم الفني",
    description:
      "افتح تذكرة وسيرد عليك فريقنا في أقرب وقت. تصلك رسالة على بريدك عند كل رد، ويمكنك متابعة المحادثة في أي وقت.",
    newTicket: "تذكرة جديدة",
    myTickets: "تذاكري",
    myTicketsText: "تابع تذاكرك السابقة وردود الدعم",
    haveAccount: "لديك حساب؟",
    signIn: "سجّل الدخول",
    signInText: "لتربط التذكرة بطلباتك وتتابع كل تذاكرك من حسابك.",
    replyTime: "نرد عادةً خلال ساعات قليلة، على مدار الأسبوع.",
    quickQuestion: "لسؤال سريع جرّب",
    faq: "الأسئلة الشائعة",
    or: "أو",
    whatsapp: "واتساب",
    errors: {
      subjectTooLong: (max: number) => `العنوان أطول من ${max} حرفاً.`,
      subjectShort: "اكتب عنواناً واضحاً للمشكلة.",
      bodyTooLong: (max: number) => `الرسالة أطول من ${max} حرف.`,
      bodyEmpty: "اكتب رسالتك.",
      emailRequired: "أدخل بريدك الإلكتروني لنرد عليك.",
      emailTooLong: "البريد الإلكتروني طويل جداً.",
      emailInvalid: "صيغة البريد الإلكتروني غير صحيحة.",
      emailFallback: "البريد غير صالح.",
      orderInvalid: "الطلب المختار غير صالح. حدّث الصفحة وحاول مجدداً.",
      orderUnverified: "تعذّر التحقق من الطلب المختار.",
      tooManyTickets: (wait: string) => `أنشأت تذاكر كثيرة. حاول مجدداً بعد ${wait}، أو رد على تذكرتك الحالية.`,
      ticketUnverified: "تعذّر التحقق من التذكرة. حدّث الصفحة وحاول مجدداً.",
      ticketUnverifiedShort: "تعذّر التحقق من التذكرة.",
      tooManyReplies: (wait: string) => `رسائل كثيرة خلال وقت قصير. حاول مجدداً بعد ${wait}.`,
      notFound: "التذكرة غير موجودة.",
    },
    sent: "تم إرسال تذكرتك.",
    replied: "تم إرسال ردك.",
    closed: "تم إغلاق التذكرة. يمكنك إعادة فتحها بإرسال رد جديد.",
  },

  tickets: {
    metaTitle: "تذاكر الدعم",
    ticketTitle: "تذكرة دعم",
    account: "حسابي",
    title: "تذاكر الدعم",
    text: "محادثاتك مع فريق الدعم. نرسل لك بريداً عند كل رد.",
    newTicket: "تذكرة جديدة",
    noTicketsPage: "لا توجد تذاكر في هذه الصفحة",
    noTickets: "لا توجد تذاكر بعد",
    noTicketsText: "واجهتك مشكلة في طلب أو لديك سؤال؟ افتح تذكرة وسنرد عليك.",
    firstPage: "العودة لأول صفحة",
    open: "افتح تذكرة",
    lastMessage: "آخر رسالة",
    messages: "رسائل",
    order: "طلب",
    pages: "صفحات التذاكر",
    backSupport: "الدعم الفني",
    backMine: "تذاكري",
    created: "أُنشئت:",
    orderLabel: "الطلب:",
    createdNotice: "تم إرسال تذكرتك. سنرد عليك هنا ونرسل لك إشعاراً بالبريد.",
    conversation: "المحادثة",
    reply: "الرد",
    closedNotice: "هذه التذكرة مغلقة. إن عادت المشكلة، أرسل رداً وسنعيد فتحها.",
    messagesLabel: "الرسائل",
    staff: "فريق الدعم",
    you: "أنت",
  },

  pager: {
    prev: "السابق",
    next: "التالي",
    page: "صفحة",
    of: "من",
  },

  notFound: {
    title: "الصفحة غير موجودة",
    text: "ربما تغيّر الرابط أو لم يعد هذا المنتج متاحاً. جرّب البحث أو عُد إلى الصفحة الرئيسية.",
  },

  content: {
    related: "صفحات ذات صلة",
  },

  // Shopper-facing errors from pricing (coupons, cart) and the checkout / top-up APIs.
  pricing: {
    invalidCoupon: "كود الخصم غير صالح",
    couponNotStarted: "كود الخصم لم يبدأ العمل به بعد",
    couponExpired: "انتهت صلاحية كود الخصم",
    couponUsedUp: "انتهى عدد مرات استخدام كود الخصم",
    couponNotApplicable: "كود الخصم لا ينطبق على المنتجات الموجودة في سلتك",
    couponMin: (amount: string, scoped: boolean) =>
      `يتطلب كود الخصم مشتريات بقيمة ${amount} على الأقل${scoped ? " من المنتجات المشمولة بالعرض" : ""}`,
    couponPerCustomer: "لقد استخدمت كود الخصم هذا الحد الأقصى من المرات المسموح بها",
    couponLabelPercent: (value: number, max: string | null) => `خصم ${value}%${max ? ` (بحد أقصى ${max})` : ""}`,
    couponLabelFixed: (amount: string) => `خصم ${amount}`,
    couponScope: (base: string, scope: string) => `${base} على «${scope}»`,
    cartEmpty: "السلة فارغة",
    cartTooBig: (max: number) => `لا يمكن أن تحتوي السلة على أكثر من ${max} منتجاً`,
    badItem: "منتج غير صالح في السلة",
    badQuantity: "الكمية غير صالحة",
    itemGone: "أحد المنتجات في السلة لم يعد متوفراً، يرجى تحديث السلة",
    itemInactive: (name: string) => `المنتج "${name}" غير متاح حالياً، يرجى إزالته من السلة`,
    maxQuantity: (item: string, max: number) => `أقصى كمية من "${item}" هي ${max}`,
    mixedCurrency: "لا يمكن الدفع لمنتجات بعملات مختلفة في طلب واحد",
    cartInvalid: "السلة غير صالحة.",
    couponThrottled: (wait: string) => `محاولات كثيرة لرموز الخصم. حاول مجدداً بعد ${wait}.`,
  },

  api: {
    emailRequired: "البريد الإلكتروني مطلوب",
    emailTooLong: "البريد الإلكتروني طويل جداً",
    emailInvalid: "البريد الإلكتروني غير صالح",
    badItem: "منتج غير صالح في السلة",
    badQuantity: "الكمية غير صالحة",
    quantityInt: "الكمية يجب أن تكون رقماً صحيحاً",
    quantityMin: "أقل كمية هي 1",
    quantityMax: (max: number) => `أقصى كمية للمنتج الواحد هي ${max}`,
    cartInvalid: "السلة غير صالحة",
    cartEmpty: "السلة فارغة",
    cartTooBig: (max: number) => `لا يمكن أن تحتوي السلة على أكثر من ${max} منتجاً`,
    invalidCoupon: "كود الخصم غير صالح",
    badOrderData: "بيانات الطلب غير صالحة",
    badProvider: "طريقة الدفع غير صالحة",
    outOfStock: (item: string) => `المنتج "${item}" نفد من المخزون`,
    notEnough: (item: string, available: number) => `الكمية المطلوبة من "${item}" غير متوفرة، المتوفر حالياً: ${available}`,
    sessionExpired: "انتهت جلستك، يرجى تسجيل الدخول من جديد",
    tooMany: "طلبات كثيرة جداً، يرجى المحاولة بعد دقيقة",
    badRequest: "طلب غير صالح",
    signInForWallet: "سجّل الدخول لاستخدام رصيد المحفظة",
    providerUnavailable: "طريقة الدفع المختارة غير متاحة حالياً",
    paymentUnavailable: "الدفع غير متاح حالياً، يرجى المحاولة لاحقاً",
    highDemand: (item: string) => `الطلب مرتفع حالياً على "${item}"، يرجى المحاولة مرة أخرى بعد لحظات`,
    paymentStartFailed: "تعذر بدء عملية الدفع، يرجى المحاولة مرة أخرى",
    unexpected: "حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى",
    orderDescription: (shortId: string) => `طلب Nitro Store #${shortId}`,
    topupAmountRequired: "أدخل مبلغ الشحن",
    topupAmountInvalid: "مبلغ الشحن غير صالح",
    topupMin: (amount: string) => `أقل مبلغ للشحن هو ${amount}`,
    topupMax: (amount: string) => `أقصى مبلغ للشحن هو ${amount}`,
    topupWhole: "مبلغ الشحن يجب أن يكون رقماً صحيحاً بدون كسور",
    currencyUnavailable: "هذه العملة غير متاحة حالياً. اختر عملة أخرى وحاول مجدداً.",
    signInForTopup: "يجب تسجيل الدخول لشحن المحفظة",
    topupDescription: "شحن رصيد محفظة Nitro Store",
  },
};

export type Dictionary = typeof ar;
