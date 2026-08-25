import { redisClient } from "../client.js";
import { RedisKeys } from "../keys.js";

import type {
    DriverPresence,
} from "../types.js";
import { removeDriverLocation } from "./geo.service.js";

async function getPresence(
    driverId: string
): Promise<DriverPresence | null> {

    const data = await redisClient.get(
        RedisKeys.DRIVER_PRESENCE(driverId)
    );

    if (!data) {
        return null;
    }

    try {

        return JSON.parse(data) as DriverPresence;

    } catch {

        return null;

    }

}

async function ensurePresence(
    driverId: string
): Promise<DriverPresence> {

    const presence =
        await getPresence(driverId);

    if (presence) {
        return presence;
    }

    return {
        online: false,
        available: false,
        lastSeen: Date.now(),
    };

}

async function savePresence(
    driverId: string,
    presence: DriverPresence
): Promise<void> {

    await redisClient.set(
        RedisKeys.DRIVER_PRESENCE(driverId),
        JSON.stringify(presence),
        {
            EX: 5*60,
        }
    );

}

export async function setDriverOnline(
    driverId: string
): Promise<void> {

    const presence =
        await ensurePresence(driverId);

    presence.online = true;
    presence.available = false;
    presence.lastSeen = Date.now();

    await savePresence(
        driverId,
        presence
    );

}

export async function setDriverOffline(
    driverId: string
): Promise<void> {

    await removeDriverLocation(driverId);
    await redisClient.del(RedisKeys.DRIVER_PRESENCE(driverId));

}

export async function updateDriverHeartbeat(
    driverId: string
): Promise<void> {

    const presence =
        await getPresence(driverId);
    if(!presence){
        return;
    }

    presence.lastSeen = Date.now();

    await savePresence(
        driverId,
        presence
    );

}

export async function setDriverAvailable(
    driverId: string
): Promise<void> {

    const presence =
        await ensurePresence(driverId);

    presence.online = true;
    presence.available = true;
    presence.lastSeen = Date.now();

    await savePresence(
        driverId,
        presence
    );

}

export async function setDriverBusy(
    driverId: string
): Promise<void> {

    const presence =
        await ensurePresence(driverId);

    presence.online = true;
    presence.available = false;
    presence.lastSeen = Date.now();

    await removeDriverLocation(driverId);

    await savePresence(
        driverId,
        presence
    );

}

export async function isDriverOnline(
    driverId: string
): Promise<boolean> {

    const presence =
        await getPresence(driverId);

    if (!presence) {
        return false;
    }

    return presence.online;

}

export async function isDriverAvailable(
    driverId: string
): Promise<boolean> {

    const presence =
        await getPresence(driverId);

    if (!presence) {
        return false;
    }

    return (
        presence.online &&
        presence.available
    );

}

export async function getDriverPresence(
    driverId: string
): Promise<DriverPresence | null> {

    return getPresence(
        driverId
    );

}