import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
data: new SlashCommandBuilder()
.setName('hexcolor')
.setDescription('Générer une couleur hexadécimale aléatoire avec aperçu')
.addStringOption(option =>
option.setName('color')
.setDescription('Couleur hexadécimale spécifique (ex. : #FF5733 ou FF5733)')
.setRequired(false)),


async execute(interaction) {
    await InteractionHelper.safeExecute(
        interaction,
        async () => {
            let hexColor = interaction.options.getString('color');
            let isRandom = false;

            if (!hexColor) {
                isRandom = true;
                hexColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
            } else {
                hexColor = hexColor.replace('#', '');

                if (!/^[0-9A-Fa-f]{3,6}$/.test(hexColor)) {
                    return await replyUserError(interaction, {
                        type: ErrorTypes.VALIDATION,
                        message:
                            'Veuillez fournir un code hexadécimal valide.\n\n' +
                            '**Formats valides :**\n' +
                            '• `#FF5733` (avec le dièse)\n' +
                            '• `FF5733` (sans le dièse)\n' +
                            '• `F57` (format abrégé à 3 chiffres)\n\n' +
                            '**Invalide :** `#GG5733` (G n’est pas un chiffre hexadécimal)'
                    });
                }

                if (hexColor.length === 3) {
                    hexColor = hexColor.split('').map(c => c + c).join('');
                }

                hexColor = '#' + hexColor.toUpperCase();
            }

            const r = parseInt(hexColor.slice(1, 3), 16);
            const g = parseInt(hexColor.slice(3, 5), 16);
            const b = parseInt(hexColor.slice(5, 7), 16);

            const brightness = (r * 299 + g * 587 + b * 114) / 1000;
            const textColor = brightness > 128 ? '#000000' : '#FFFFFF';

            const colorPreviewUrl =
                `https://dummyimage.com/200x100/${hexColor.replace('#', '')}/${textColor.replace('#', '')}?text=${encodeURIComponent(hexColor)}`;

            const colorName = getColorName(hexColor);

            const embed = successEmbed(
                '🎨 Informations sur la couleur',
                `**Hexadécimal :** \`${hexColor}\`\n` +
                `**RGB :** \`rgb(${r}, ${g}, ${b})\`\n` +
                `**HSL :** \`${rgbToHsl(r, g, b)}\`\n` +
                `**Nom :** ${colorName || 'Couleur personnalisée'}`
            )
                .setColor(hexColor)
                .setImage(colorPreviewUrl);

            if (isRandom) {
                embed.setFooter({
                    text: 'Couleur générée aléatoirement'
                });
            }

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });
        },
        'Impossible de générer les informations sur la couleur. Veuillez réessayer.',
        {
            autoDefer: true,
            deferOptions: {
                flags: MessageFlags.Ephemeral
            }
        }
    );
},


};

function rgbToHsl(r, g, b) {
r /= 255;
g /= 255;
b /= 255;

    
const max = Math.max(r, g, b);
const min = Math.min(r, g, b);

let h, s;
let l = (max + min) / 2;

if (max === min) {
    h = s = 0;
} else {
    const d = max - min;

    s = l > 0.5
        ? d / (2 - max - min)
        : d / (max + min);

    switch (max) {
        case r:
            h = (g - b) / d + (g < b ? 6 : 0);
            break;

        case g:
            h = (b - r) / d + 2;
            break;

        case b:
            h = (r - g) / d + 4;
            break;
    }

    h /= 6;
}

return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;


}

function getColorName(hex) {
const colors = {
'#FF0000': 'Rouge',
'#00FF00': 'Vert',
'#0000FF': 'Bleu',
'#FFFF00': 'Jaune',
'#FF00FF': 'Magenta',
'#00FFFF': 'Cyan',
'#000000': 'Noir',
'#FFFFFF': 'Blanc',
'#808080': 'Gris',
'#FFA500': 'Orange',
'#800080': 'Violet',
'#A52A2A': 'Marron',
'#FFC0CB': 'Rose',
'#008000': 'Vert foncé',
'#000080': 'Bleu marine',
'#FFD700': 'Or',
'#C0C0C0': 'Argent',
'#FF6347': 'Tomate',
'#40E0D0': 'Turquoise',
'#E6E6FA': 'Lavande'
};

    
if (colors[hex.toUpperCase()]) {
    return colors[hex.toUpperCase()];
}

const hexValue = parseInt(hex.replace('#', ''), 16);

let closestColor = '';
let minDistance = Infinity;

for (const [colorHex, name] of Object.entries(colors)) {
    const colorValue = parseInt(colorHex.replace('#', ''), 16);
    const distance = Math.abs(hexValue - colorValue);

    if (distance < minDistance) {
        minDistance = distance;
        closestColor = name;
    }
}

return minDistance < 1000000
    ? `Proche de ${closestColor}`
    : null;


}
