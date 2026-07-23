/**
 * Restrictions des commandes avec préfixe — le tableau de bord et les
 * configurations avancées restent disponibles uniquement via les commandes slash.
 */

/** Commandes principales qui ne peuvent pas du tout être utilisées avec un préfixe. */
export const SLASH_ONLY_COMMANDS = new Set([
  'configwizard',
  'help',
  'embedbuilder',
  'wipedata',
  'apply',
]);

/** Sous-commandes bloquées pour toutes les commandes lorsqu'elles sont utilisées avec un préfixe. */
export const GLOBAL_BLOCKED_SUBCOMMANDS = new Set([
  'dashboard',
  'setup',
]);

/** Groupes de sous-commandes bloqués pour toutes les commandes lorsqu'ils sont utilisés avec un préfixe. */
export const GLOBAL_BLOCKED_SUBCOMMAND_GROUPS = new Set([
  'config',
]);

/** Sous-commandes spécifiques à certaines commandes qui restent uniquement disponibles via slash. */
export const COMMAND_BLOCKED_SUBCOMMANDS = {
  music: new Set([
    'shuffle',
    'loop',
    'seek',
    'remove',
    'move',
    'clear',
    '247',
  ]),
  birthday: new Set(['setchannel']),
  report: new Set(['setchannel']),
};

function collectSubcommandNames(commandJson) {
  const subcommandGroup = commandJson.options?.find((opt) => opt.type === 2);

  if (subcommandGroup) {
    const names = [];

    for (const group of subcommandGroup.options || []) {
      names.push(...(group.options?.map((opt) => opt.name) || []));
    }

    return names;
  }

  return (
    commandJson.options?.filter((opt) => opt.type === 1) || []
  ).map((sub) => sub.name);
}

function isSubcommandBlocked(commandName, subcommandName) {
  if (!subcommandName) {
    return false;
  }

  if (GLOBAL_BLOCKED_SUBCOMMANDS.has(subcommandName)) {
    return true;
  }

  const commandBlocked = COMMAND_BLOCKED_SUBCOMMANDS[commandName];

  return commandBlocked?.has(subcommandName) ?? false;
}

/**
 * Indique si une commande utilisant un préfixe doit être refusée.
 *
 * @param {object} command - Module de commande chargé
 * @param {string[]} args - Arguments du préfixe analysés (après le nom de la commande)
 * @param {(name: string) => string} resolveSubcommandAlias - Fonction permettant de résoudre les alias des sous-commandes
 * @returns {{ blocked: boolean, reason?: string }}
 */
export function getPrefixRestriction(command, args, resolveSubcommandAlias) {
  if (!command?.data?.toJSON) {
    return { blocked: false };
  }

  const commandJson = command.data.toJSON();
  const commandName = commandJson.name?.toLowerCase();

  if (command.prefixOnly === false || command.slashOnly === true) {
    return {
      blocked: true,
      reason: 'Cette commande est uniquement disponible en commande slash.',
    };
  }

  if (SLASH_ONLY_COMMANDS.has(commandName)) {
    return {
      blocked: true,
      reason: 'Cette commande est uniquement disponible en commande slash.',
    };
  }

  const [firstArg, secondArg] = args.map(
    (arg) => arg?.toLowerCase?.() || null,
  );

  const resolvedFirstArg = firstArg
    ? resolveSubcommandAlias(firstArg)
    : null;

  const resolvedSecondArg = secondArg
    ? resolveSubcommandAlias(secondArg)
    : null;

  const subcommandGroup = commandJson.options?.find(
    (opt) => opt.type === 2,
  );

  const allSubcommandNames = collectSubcommandNames(commandJson);

  const allSubcommandsBlocked =
    allSubcommandNames.length > 0 &&
    allSubcommandNames.every((name) =>
      isSubcommandBlocked(commandName, name),
    );

  if (allSubcommandsBlocked) {
    return {
      blocked: true,
      reason: 'Cette commande est uniquement disponible en commande slash.',
    };
  }

  if (
    firstArg &&
    GLOBAL_BLOCKED_SUBCOMMAND_GROUPS.has(firstArg)
  ) {
    return {
      blocked: true,
      reason:
        'Cette configuration est uniquement disponible en commande slash.',
    };
  }

  if (
    resolvedFirstArg &&
    isSubcommandBlocked(commandName, resolvedFirstArg)
  ) {
    return {
      blocked: true,
      reason:
        'Cette sous-commande est uniquement disponible en commande slash.',
    };
  }

  if (
    subcommandGroup &&
    resolvedSecondArg &&
    isSubcommandBlocked(commandName, resolvedSecondArg)
  ) {
    return {
      blocked: true,
      reason:
        'Cette sous-commande est uniquement disponible en commande slash.',
    };
  }

  return { blocked: false };
}

export function isPrefixRestrictedCommand(
  command,
  args,
  resolveSubcommandAlias,
) {
  return getPrefixRestriction(
    command,
    args,
    resolveSubcommandAlias,
  ).blocked;
}
