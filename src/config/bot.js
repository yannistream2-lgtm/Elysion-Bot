import { logger } from '../utils/logger.js';

export const botConfig = {
  // =========================
  // PRÉSENCE DU BOT (ce que les utilisateurs voient sous le nom du bot)
  // =========================
  // Options de `status` :
  // - "online"    = point vert
  // - "idle"      = lune jaune
  // - "dnd"       = ne pas déranger (rouge)
  // - "invisible" = apparaît hors ligne
  presence: {
    // État actuel affiché sur Discord.
    status: "dnd",

    // Activités affichées sous le nom du bot.
    // Correspondance des nombres `type` de Discord :
    // 0 = Joue à
    // 1 = Diffuse
    // 2 = Écoute
    // 3 = Regarde
    // 4 = Statut personnalisé
    // 5 = Participe à
    activities: [
      {
        name: "Custom Status", // requis par l'API Discord, non affiché côté client
        state: "Elysion | Age of Heroes", // ce que les utilisateurs voient réellement
        type: 0, // Joue à
      },
    ],
  },

  // =========================
  // COMPORTEMENT DES COMMANDES
  // =========================
  commands: {
    // IDs des propriétaires du bot (séparés par des virgules dans OWNER_IDS).
    // Les propriétaires peuvent utiliser les commandes administrateur du bot.
    owners: process.env.OWNER_IDS?.split(",").map((id) => id.trim()).filter(Boolean) || [],

    // Temps d'attente par défaut entre deux utilisations d'une commande (en secondes).
    defaultCooldown: 3,

    // Si true, les anciennes commandes sont supprimées avant d'être enregistrées à nouveau.
    deleteCommands: false,

    // ID de serveur optionnel conservé pour la compatibilité avec les tutoriels ;
    // non utilisé pour l'enregistrement des commandes.
    testGuildId: process.env.TEST_GUILD_ID,

    // Lorsque true (ou MAINTENANCE_MODE=true), seuls les propriétaires du bot
    // peuvent utiliser les commandes.
    maintenanceMode: process.env.MAINTENANCE_MODE === "true",

    // Préfixe des commandes textuelles (ex. "!" pour "!ping").
    // Compatible avec les commandes slash et les commandes à préfixe.
    prefix: process.env.PREFIX || "!",
  },

  // =========================
  // SYSTÈME DE CANDIDATURES
  // =========================
  applications: {
    // Questions par défaut affichées lorsqu'un utilisateur remplit une candidature.
    defaultQuestions: [
      { question: "Quel est ton nom ?", required: true },
      { question: "Quel âge as-tu ?", required: true },
      { question: "Pourquoi souhaites-tu nous rejoindre ?", required: true },
    ],

    // Couleurs des embeds selon le statut de la candidature.
    statusColors: {
      pending: "#FFA500",
      approved: "#00FF00",
      denied: "#FF0000",
    },

    // Temps d'attente avant de pouvoir envoyer une nouvelle candidature (en heures).
    applicationCooldown: 24,

    // Supprimer automatiquement les candidatures refusées après ce nombre de jours.
    deleteDeniedAfter: 7,

    // Supprimer automatiquement les candidatures acceptées après ce nombre de jours.
    deleteApprovedAfter: 30,

    // IDs des rôles autorisés à gérer les candidatures.
    managerRoles: [], // Sera rempli depuis l'environnement ou la base de données
  },

  // =========================
  // COULEURS DES EMBEDS ET IDENTITÉ VISUELLE
  // =========================
  // IMPORTANT : Ceci est la SOURCE UNIQUE de toutes les couleurs du bot.
  embeds: {
    colors: {
      // Couleurs principales de la marque.
      primary: "#336699",
      secondary: "#2F3136",

      // Couleurs standards pour les messages de succès/erreur/avertissement/information.
      success: "#57F287",
      error: "#ED4245",
      warning: "#FEE75C",
      info: "#3498DB",

      // Couleurs utilitaires neutres.
      light: "#FFFFFF",
      dark: "#202225",
      gray: "#99AAB5",

      // Raccourcis de la palette de couleurs Discord.
      blurple: "#5865F2",
      green: "#57F287",
      yellow: "#FEE75C",
      fuchsia: "#EB459E",
      red: "#ED4245",
      black: "#000000",

      // Couleurs spécifiques aux fonctionnalités.
      giveaway: {
        active: "#57F287",
        ended: "#ED4245",
      },
      ticket: {
        open: "#57F287",
        claimed: "#FAA61A",
        closed: "#ED4245",
        pending: "#99AAB5",
      },
      economy: "#F1C40F",
      birthday: "#E91E63",
      moderation: "#9B59B6",

      // Correspondance des couleurs selon la priorité d'un ticket.
      priority: {
        none: "#95A5A6",
        low: "#3498db",
        medium: "#2ecc71",
        high: "#f1c40f",
        urgent: "#e74c3c",
      },
    },
    footer: {
      // Texte du pied de page utilisé par défaut dans les embeds du bot.
      text: "Elysion | Age of Heroes",
      // URL de l'icône du pied de page (null = aucune icône).
      icon: null,
    },
    // URL de la miniature par défaut des embeds (null = aucune miniature).
    thumbnail: null,
    author: {
      // Bloc auteur par défaut optionnel pour les embeds.
      name: null,
      icon: null,
      url: null,
    },
  },

  // =========================
  // PARAMÈTRES DE L'ÉCONOMIE
  // =========================
  economy: {
    currency: {
      // Nom de la monnaie.
      name: "pièces",
      // Nom au pluriel de la monnaie.
      namePlural: "pièces",
      // Symbole de la monnaie affiché dans les soldes.
      symbol: "🪙",
    },

    // Solde de départ des nouveaux utilisateurs.
    startingBalance: 0,

    // Montant maximum en banque avant les améliorations (si elles sont utilisées).
    baseBankCapacity: 100000,

    // Montant de la récompense quotidienne.
    dailyAmount: 100,

    // Fourchette de récompense aléatoire de la commande de travail.
    workMin: 10,
    workMax: 100,

    // Fourchette de récompense aléatoire de la commande de mendicité.
    begMin: 5,
    begMax: 50,

    // Temps d'attente des commandes (en millisecondes).
    cooldowns: {
      daily: 24 * 60 * 60 * 1000,
      work: 60 * 60 * 1000,
      crime: 2 * 60 * 60 * 1000,
      rob: 4 * 60 * 60 * 1000,
    },

    // Probabilité de réussite lors d'un braquage (0.4 = 40 %).
    robSuccessRate: 0.4,

    // Durée de prison après un braquage échoué (en millisecondes).
    // 3600000 = 1 heure.
    robFailJailTime: 3600000,
  },

  // =========================
  // PARAMÈTRES DE LA BOUTIQUE
  // =========================
  // Ajoutez les paramètres par défaut de la boutique ici si nécessaire.
  shop: {

  },
  
  // =========================
  // PARAMÈTRES DES ANNIVERSAIRES
  // =========================
  birthday: {
    // ID du rôle donné aux utilisateurs le jour de leur anniversaire.
    defaultRole: null,

    // ID du salon où les annonces d'anniversaire sont publiées.
    announcementChannel: null,

    // Fuseau horaire utilisé pour calculer les dates d'anniversaire.
    timezone: "UTC",
  },

  // =========================
  // PARAMÈTRES DE VÉRIFICATION
  // =========================
  verification: {
    // Message affiché lors de l'envoi du panneau de vérification.
    defaultMessage: "Clique sur le bouton ci-dessous pour te vérifier et accéder au serveur !",

    // Texte du bouton de vérification.
    defaultButtonText: "Se vérifier",

    // Fonctionnement de la vérification automatique.
    autoVerify: {
      // Comment la vérification automatique détermine qui est accepté :
      // - "none"        = tout le monde est vérifié immédiatement
      // - "account_age" = le compte doit avoir plus d'un certain nombre de jours
      // - "server_size" = vérification automatique uniquement sur les petits serveurs
      defaultCriteria: "none",

      // Nombre de jours utilisé lorsque `defaultCriteria` vaut `account_age`.
      defaultAccountAgeDays: 7,

      // Nombre de membres maximum utilisé lorsque `defaultCriteria` vaut `server_size`.
      // Exemple : 1000 signifie que la vérification automatique est activée
      // si le serveur possède moins de 1000 membres.
      serverSizeThreshold: 1000,

      // Limites de sécurité autorisées pour l'ancienneté des comptes.
      // 1 = minimum de jours, 365 = maximum de jours.
      minAccountAge: 1,
      maxAccountAge: 365,

      // Si true, l'utilisateur reçoit un message privé après sa vérification.
      sendDMNotification: true,

      // Descriptions lisibles pour chaque mode de vérification.
      criteria: {
        account_age: "Le compte doit avoir plus du nombre de jours indiqué",
        server_size: "Tous les utilisateurs si le serveur possède moins de 1000 membres",
        none: "Tous les utilisateurs immédiatement"
      }
    },

    // Temps minimum entre deux tentatives de vérification (en millisecondes).
    // 5000 = 5 secondes.
    verificationCooldown: 5000,

    // Nombre maximum de tentatives échouées autorisées pendant la période définie ci-dessous.
    maxVerificationAttempts: 3,

    // Période utilisée pour compter les tentatives (en millisecondes).
    // 60000 = 1 minute.
    attemptWindow: 60000,

    // Limites de sécurité en mémoire (évite une croissance excessive de la mémoire).
    maxCooldownEntries: 10000,
    maxAttemptEntries: 10000,

    // Fréquence de nettoyage des listes de cooldown/tentatives (en millisecondes).
    // 300000 = 5 minutes.
    cooldownCleanupInterval: 300000,

    // Taille maximale des métadonnées d'audit (en octets).
    maxAuditMetadataBytes: 4096,

    // Nombre maximum d'entrées d'audit conservées en mémoire.
    maxInMemoryAuditEntries: 1000,

    // Si true, toutes les actions de vérification sont enregistrées.
    logAllVerifications: true,

    // Si true, l'historique des vérifications est conservé.
    keepAuditTrail: true,
  },

  // =========================
  // MESSAGES DE BIENVENUE / DÉPART
  // =========================
  welcome: {
    // Message de bienvenue envoyé lorsqu'un utilisateur rejoint le serveur.
    // Variables : {user}, {server}, {memberCount}
    defaultWelcomeMessage:
      "Bienvenue {user} sur {server} ! Nous sommes maintenant {memberCount} membres !",

    // Message envoyé lorsqu'un utilisateur quitte le serveur.
    // Variables : {user}, {memberCount}
    defaultGoodbyeMessage:
      "{user} a quitté le serveur. Nous sommes maintenant {memberCount} membres.",

    // ID du salon pour les messages de bienvenue.
    defaultWelcomeChannel: null,

    // ID du salon pour les messages de départ.
    defaultGoodbyeChannel: null,
  },

  // =========================
  // SALONS COMPTEURS
  // =========================
  counters: {
    defaults: {
      // Modèles de nom et de description par défaut pour les compteurs.
      name: "{name} Compteur",
      description: "Compteur {name} du serveur",

      // Type de salon utilisé pour les compteurs (généralement "voice").
      type: "voice",

      // Format du nom du salon. `{count}` est remplacé automatiquement.
      channelName: "{name}-{count}",
    },

    permissions: {
      // Permissions refusées par défaut pour le salon compteur.
      deny: ["VIEW_CHANNEL"],

      // Permissions autorisées par défaut pour le salon compteur.
      allow: ["VIEW_CHANNEL", "CONNECT", "SPEAK"],
    },

    messages: {
      // Messages de réponse par défaut pour les actions des compteurs.
      created: "✅ Compteur **{name}** créé",
      deleted: "🗑️ Compteur **{name}** supprimé",
      updated: "🔄 Compteur **{name}** mis à jour",
    },

    types: {
      // Types de compteurs intégrés et manière dont chaque compteur est calculé.
      members: {
        name: "👥 Membres",
        description: "Nombre total de membres sur le serveur",
        getCount: (guild) => guild.memberCount.toString(),
      },

      bots: {
        name: "🤖 Bots",
        description: "Nombre total de comptes bots sur le serveur",
        getCount: (guild) =>
          guild.members.cache.filter((m) => m.user.bot).size.toString(),
      },

      members_only: {
        name: "👤 Humains",
        description: "Nombre total de membres humains (hors bots)",
        getCount: (guild) =>
          guild.members.cache.filter((m) => !m.user.bot).size.toString(),
      },
    },
  },

  // =========================
  // MESSAGES GÉNÉRIQUES DU BOT
  // =========================
  messages: {
    noPermission: "Tu n'as pas la permission d'utiliser cette commande.",
    cooldownActive: "Merci d'attendre {time} avant d'utiliser à nouveau cette commande.",
    errorOccurred: "Une erreur est survenue lors de l'exécution de cette commande.",
    missingPermissions:
      "Il me manque les permissions nécessaires pour effectuer cette action.",
    commandDisabled: "Cette commande a été désactivée.",
    maintenanceMode: "Le bot est actuellement en maintenance.",
  },

  // =========================
  // ACTIVATION / DÉSACTIVATION DES FONCTIONNALITÉS
  // =========================
  // Définissez une fonctionnalité sur `false` pour la désactiver globalement.
  features: {
    // Systèmes principaux.
    economy: true,
    leveling: true,
    moderation: true,
    logging: true,
    welcome: true,

    // Systèmes d'engagement communautaire.
    tickets: true,
    giveaways: true,
    birthday: true,
    counter: true,

    // Systèmes de sécurité et d'auto-service.
    verification: true,
    reactionRoles: true,
    joinToCreate: true,

    // Modules utilitaires / amélioration de l'expérience.
    voice: true,
    search: true,
    tools: true,
    utility: true,
    community: true,
    fun: true,
    music: true,
  },
};

export function validateConfig(config) {
  const errors = [];

  if (process.env.NODE_ENV !== 'production') {
    logger.debug('Vérification des variables d’environnement :');
    logger.debug('DISCORD_TOKEN existe :', !!process.env.DISCORD_TOKEN);
    logger.debug('TOKEN existe :', !!process.env.TOKEN);
    logger.debug('CLIENT_ID existe :', !!process.env.CLIENT_ID);
    logger.debug('GUILD_ID existe :', !!process.env.GUILD_ID);
    logger.debug('POSTGRES_HOST existe :', !!process.env.POSTGRES_HOST);
    logger.debug('NODE_ENV :', process.env.NODE_ENV);
  }

  if (!process.env.DISCORD_TOKEN && !process.env.TOKEN) {
    errors.push("Le token du bot est requis (variable d'environnement DISCORD_TOKEN ou TOKEN)");
  }

  if (!process.env.CLIENT_ID) {
    errors.push("Le Client ID est requis (variable d'environnement CLIENT_ID)");
  }

  if (process.env.NODE_ENV === 'production') {
    // Une URL de connexion complète (DATABASE_URL / POSTGRES_URL)
    // satisfait toutes les exigences PostgreSQL.
    const hasConnectionUrl = Boolean(process.env.POSTGRES_URL || process.env.DATABASE_URL);

    if (!hasConnectionUrl) {
      if (!process.env.POSTGRES_HOST) {
        errors.push("La connexion PostgreSQL est requise en production (définissez DATABASE_URL/POSTGRES_URL ou POSTGRES_HOST)");
      }

      if (!process.env.POSTGRES_USER) {
        errors.push("L'utilisateur PostgreSQL est requis en production (définissez DATABASE_URL/POSTGRES_URL ou POSTGRES_USER)");
      }

      if (!process.env.POSTGRES_PASSWORD) {
        errors.push("Le mot de passe PostgreSQL est requis en production (définissez DATABASE_URL/POSTGRES_URL ou POSTGRES_PASSWORD)");
      }
    }
  }

  return errors;
}

const configErrors = validateConfig(botConfig);

if (configErrors.length > 0) {
  logger.error("Erreurs de configuration du bot :", configErrors.join("\n"));

  if (process.env.NODE_ENV === "production") {
    process.exit(1);
  }
}

export const BotConfig = botConfig;

const COMMAND_CATEGORY_FEATURE_MAP = {
  birthday: "birthday",
  community: "community",
  economy: "economy",
  fun: "fun",
  giveaway: "giveaways",
  jointocreate: "joinToCreate",
  leveling: "leveling",
  logging: "logging",
  moderation: "moderation",
  music: "music",
  reaction_roles: "reactionRoles",
  search: "search",
  serverstats: "counter",
  ticket: "tickets",
  tools: "tools",
  utility: "utility",
  verification: "verification",
  welcome: "welcome",
};

function normalizeCategoryKey(category) {
  return String(category || "").trim().toLowerCase().replace(/\s+/g, "_");
}

export function getCommandPrefix() {
  return botConfig.commands?.prefix ?? "!";
}

export function getBotOwners() {
  return (botConfig.commands?.owners ?? [])
    .map((id) => String(id).trim())
    .filter(Boolean);
}

export function isBotOwner(userId) {
  if (!userId) {
    return false;
  }

  return getBotOwners().includes(String(userId));
}

export function isMaintenanceMode() {
  return botConfig.commands?.maintenanceMode === true;
}

export function getBotMessage(key, replacements = {}) {
  let message = botConfig.messages?.[key] || key;

  for (const [placeholder, value] of Object.entries(replacements)) {
    message = message.replace(new RegExp(`\\{${placeholder}\\}`, "g"), String(value));
  }

  return message;
}

export function isFeatureEnabled(featureKey) {
  if (!featureKey) {
    return true;
  }

  return botConfig.features?.[featureKey] !== false;
}

export function isCommandCategoryEnabled(category) {
  const normalized = normalizeCategoryKey(category);

  if (!normalized || normalized === "core") {
    return true;
  }

  const featureKey = COMMAND_CATEGORY_FEATURE_MAP[normalized];

  if (!featureKey) {
    return true;
  }

  return isFeatureEnabled(featureKey);
}

export function getApplicationStatusColor(status) {
  const colors = botConfig.applications?.statusColors || {};
  const hex = colors[status];

  return hex
    ? getColor(hex)
    : getColor(
        status === "approved"
          ? "success"
          : status === "denied"
            ? "error"
            : "warning"
      );
}

export function getDefaultApplicationQuestions() {
  return (botConfig.applications?.defaultQuestions || [])
    .map((entry) =>
      typeof entry === "string" ? entry : entry.question,
    )
    .filter(Boolean);
}

export function getColor(path, fallback = "#99AAB5") {
  if (typeof path === "number") return path;

  if (typeof path === "string" && path.startsWith("#")) {
    return parseInt(path.replace("#", ""), 16);
  }

  const result = path
    .split(".")
    .reduce(
      (obj, key) =>
        obj && obj[key] !== undefined ? obj[key] : fallback,
      botConfig.embeds.colors,
    );

  if (typeof result === "string" && result.startsWith("#")) {
    return parseInt(result.replace("#", ""), 16);
  }

  return result;
}

export function getRandomColor() {
  const colors = Object.values(botConfig.embeds.colors).flatMap((color) =>
    typeof color === "string" ? color : Object.values(color),
  );

  return colors[Math.floor(Math.random() * colors.length)];
}

export default botConfig;
