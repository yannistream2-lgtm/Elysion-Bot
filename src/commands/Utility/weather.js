import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";

export default {
    data: new SlashCommandBuilder()
        .setName("weather")
        .setDescription("Obtenir les informations météorologiques en temps réel d'un lieu")
        .addStringOption((option) =>
            option
                .setName("city")
                .setDescription("Le nom de la ville, par exemple : 'Londres' ou 'Tokyo'")
                .setRequired(true),
        ),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);

        if (!deferSuccess) {
            logger.warn(`Échec du report de l'interaction Weather`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'weather'
            });
            return;
        }

        const city = interaction.options.getString("city");

        const geoResponse = await fetch(
            `${GEOCODING_URL}?name=${encodeURIComponent(city)}`,
        );

        const geoData = await geoResponse.json();

        if (!geoData.results || geoData.results.length === 0) {
            logger.info(`Commande Weather - ville introuvable`, {
                userId: interaction.user.id,
                city: city,
                guildId: interaction.guildId
            });

            await replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: `Impossible de trouver un emplacement pour **${city}**. Veuillez vérifier l'orthographe.`
            });

            return;
        }

        const { latitude, longitude, name, country } = geoData.results[0];
        const cityDisplay = name;

        const weatherResponse = await fetch(
            `${WEATHER_URL}?latitude=${latitude}&longitude=${longitude}&current_weather=true`,
        );

        const weatherData = await weatherResponse.json();

        if (weatherData.error) {
            logger.error(`Erreur de l'API météo`, {
                error: weatherData.reason,
                city: city,
                userId: interaction.user.id,
                guildId: interaction.guildId
            });

            await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'Une erreur du service météorologique est survenue.'
            });

            return;
        }

        const current = weatherData.current || weatherData.current_weather || {};

        const temperature =
            current.temperature != null
                ? Math.round(current.temperature)
                : "N/A";

        const humidity =
            current.relativehumidity ??
            current.relative_humidity_2m ??
            "N/A";

        const windSpeed =
            current.windspeed != null
                ? Math.round(current.windspeed)
                : "N/A";

        const weatherCode =
            current.weathercode ??
            current.weather_code ??
            null;

        const condition = getWeatherDescription(weatherCode);

        const embed = createEmbed({
            title: `Météo à ${cityDisplay}, ${country}`,
            description: condition.description
        })
            .addFields(
                {
                    name: "Température",
                    value: `${temperature}°C`,
                    inline: true,
                },
                {
                    name: "Humidité",
                    value: `${humidity}%`,
                    inline: true,
                },
                {
                    name: "Vitesse du vent",
                    value: `${windSpeed} km/h`,
                    inline: true,
                },
            )
            .setFooter({
                text: `Latitude : ${latitude.toFixed(2)} | Longitude : ${longitude.toFixed(2)}`,
            });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed]
        });

        logger.info(`Commande Weather exécutée`, {
            userId: interaction.user.id,
            city: cityDisplay,
            country: country,
            temperature: temperature,
            guildId: interaction.guildId
        });
    },
};

function getWeatherDescription(code) {
    if (code >= 0 && code <= 3) {
        return {
            description: "Ciel dégagé / Partiellement nuageux",
            emoji: ""
        };

    } else if (code >= 45 && code <= 48) {
        return {
            description: "Brouillard et brouillard givrant",
            emoji: ""
        };

    } else if (code >= 51 && code <= 67) {
        return {
            description: "Bruine ou pluie",
            emoji: ""
        };

    } else if (code >= 71 && code <= 75) {
        return {
            description: "Chutes de neige",
            emoji: ""
        };

    } else if (code >= 80 && code <= 86) {
        return {
            description: "Averses (pluie/neige)",
            emoji: ""
        };

    } else if (code >= 95 && code <= 99) {
        return {
            description: "Orage",
            emoji: ""
        };
    }

    return {
        description: "Conditions météorologiques inconnues.",
        emoji: ""
    };
}
