import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getColor } from '../../config/bot.js';

const BASE_ALPHABETS = {
    'BIN': { base: 2, prefix: '0b', name: 'Binaire', alphabet: '01' },
    'OCT': { base: 8, prefix: '0o', name: 'Octal', alphabet: '0-7' },
    'DEC': { base: 10, prefix: '', name: 'Décimal', alphabet: '0-9' },
    'HEX': { base: 16, prefix: '0x', name: 'Hexadécimal', alphabet: '0-9A-F' },
    'B64': { base: 64, prefix: 'b64:', name: 'Base64', alphabet: 'A-Za-z0-9+/=' },
    'B36': { base: 36, prefix: '', name: 'Base36', alphabet: '0-9A-Z' },
    'B58': { base: 58, prefix: '', name: 'Base58', alphabet: '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz' },
    'B62': { base: 62, prefix: '', name: 'Base62', alphabet: '0-9A-Za-z' },
};

const BASE_NAMES = Object.entries(BASE_ALPHABETS).map(([key, { name }]) => ({ name: `${key} (${name})`, value: key }));
const BASE_CHARSETS = {
    BIN: '01',
    OCT: '01234567',
    DEC: '0123456789',
    HEX: '0123456789ABCDEF',
    B36: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    B58: '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz',
    B62: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
};

function parseBigIntFromBase(value, baseKey) {
    if (baseKey === 'B64') {
        const bytes = Buffer.from(value, 'base64');
        return bytes.reduce((acc, byte) => (acc * 256n) + BigInt(byte), 0n);
    }

    const charset = BASE_CHARSETS[baseKey];
    if (!charset) {
        throw new Error(`Base non prise en charge : ${baseKey}`);
    }

    const normalized = ['BIN', 'OCT', 'DEC', 'HEX', 'B36'].includes(baseKey)
        ? value.toUpperCase()
        : value;

    let result = 0n;
    const base = BigInt(charset.length);

    for (const char of normalized) {
        const digit = charset.indexOf(char);
        if (digit < 0) {
            throw new Error(`Caractère invalide '${char}' pour la base ${baseKey}`);
        }
        result = (result * base) + BigInt(digit);
    }

    return result;
}

function formatBigIntToBase(value, baseKey) {
    if (baseKey === 'B64') {
        if (value === 0n) {
            return Buffer.from([0]).toString('base64');
        }

        const bytes = [];
        let n = value;
        while (n > 0n) {
            bytes.unshift(Number(n & 0xffn));
            n >>= 8n;
        }

        return Buffer.from(bytes).toString('base64');
    }

    const charset = BASE_CHARSETS[baseKey];
    if (!charset) {
        throw new Error(`Base non prise en charge : ${baseKey}`);
    }

    if (value === 0n) {
        return '0';
    }

    const base = BigInt(charset.length);
    let n = value;
    let output = '';

    while (n > 0n) {
        const index = Number(n % base);
        output = charset[index] + output;
        n /= base;
    }

    return output;
}

export default {
    data: new SlashCommandBuilder()
        .setName('baseconvert')
        .setDescription('Convertir des nombres entre différentes bases')
        .addStringOption(option =>
            option.setName('number')
                .setDescription('Le nombre à convertir')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('from')
                .setDescription('Base/format d’origine')
                .setRequired(true)
                .addChoices(...BASE_NAMES))
        .addStringOption(option =>
            option.setName('to')
                .setDescription('Base/format cible (par défaut : toutes)')
                .setRequired(false)
                .addChoices(...BASE_NAMES)),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Échec du report de l'interaction BaseConvert`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'baseconvert'
            });
            return;
        }

        const numberStr = interaction.options.getString('number').trim();
        const fromBase = interaction.options.getString('from');
        const toBase = interaction.options.getString('to');

        const { prefix: fromPrefix, name: fromName } = BASE_ALPHABETS[fromBase];

        const cleanNumber = fromPrefix && numberStr.startsWith(fromPrefix)
            ? numberStr.slice(fromPrefix.length)
            : numberStr;

        if (!cleanNumber) {
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Vous devez fournir un nombre à convertir.\n\n**Exemple :** `/baseconvert number:1010 from:BIN to:DEC`',
            });
        }

        const alphabet = BASE_ALPHABETS[fromBase].alphabet;
        const regex = new RegExp(`^[${alphabet}]+$`, 'i');

        if (!regex.test(cleanNumber)) {
            let examples = '';

            if (fromBase === 'BIN') {
                examples = '\n\n**Valide :** 101, 1010, 11111 | **Invalide :** 5 (le chiffre 5 n’est pas autorisé)';
            } else if (fromBase === 'OCT') {
                examples = '\n\n**Valide :** 77, 123, 755 | **Invalide :** 8 (seuls les chiffres de 0 à 7 sont autorisés)';
            } else if (fromBase === 'DEC') {
                examples = '\n\n**Valide :** 42, 123, 999 | **Invalide :** 12.34 (les nombres décimaux ne sont pas autorisés)';
            } else if (fromBase === 'HEX') {
                examples = '\n\n**Valide :** FF, A1B2, DEADBEEF | **Invalide :** G (seuls les caractères 0-9 et A-F sont autorisés)';
            }

            logger.warn(`Entrée de conversion de base invalide : ${cleanNumber} pour la base ${fromBase}`);

            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: `Vous avez fourni : \`${cleanNumber}\`\n\nCaractères valides : \`${alphabet}\`${examples}`,
            });
        }

        let decimalValue;

        try {
            if (fromBase === 'B64') {
                decimalValue = parseBigIntFromBase(cleanNumber, fromBase);
            } else {
                decimalValue = parseBigIntFromBase(cleanNumber, fromBase);
            }
        } catch (error) {
            logger.error('Erreur lors de l’analyse de la conversion de base :', error);

            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Le nombre est trop grand pour être traité.\n\nEssayez avec un nombre plus petit.',
            });
        }

        if (toBase) {
            const { prefix: toPrefix, name: toName } = BASE_ALPHABETS[toBase];
            let result;

            try {
                result = formatBigIntToBase(decimalValue, toBase);

                const embed = successEmbed(
                    '🔄 Résultat de la conversion',
                    `**De ${fromName} (${fromBase}) :** \`${fromPrefix}${cleanNumber}\`\n` +
                    `**Vers ${toName} (${toBase}) :** \`${toPrefix}${result}\`\n` +
                    `**Décimal :** \`${decimalValue.toLocaleString()}\``
                );

                embed.setColor(getColor('success'));

                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

            } catch (error) {
                logger.error(`Erreur lors de la conversion vers ${toName} :`, error);

                await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'Le résultat est trop grand ou incompatible.\n\nEssayez avec un nombre plus petit ou une autre base cible.',
                });
            }

        } else {
            let description = `**Entrée (${fromName}) :** \`${fromPrefix}${cleanNumber}\`\n`;
            description += `**Décimal :** \`${decimalValue.toLocaleString()}\`\n\n`;

            for (const [baseKey, { prefix, name }] of Object.entries(BASE_ALPHABETS)) {
                if (baseKey === fromBase) continue;

                try {
                    let value = formatBigIntToBase(decimalValue, baseKey);

                    description += `**${name} (${baseKey}) :** \`${prefix}${value}\`\n`;
                } catch (error) {
                    description += `**${name} (${baseKey}) :** *Nombre trop grand pour être converti*\n`;
                }
            }

            const embed = successEmbed(
                '🔄 Résultats des conversions',
                description
            );

            embed.setColor(getColor('primary'));

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }
    },
};
