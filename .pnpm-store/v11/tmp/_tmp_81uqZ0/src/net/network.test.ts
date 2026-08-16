import { describe, expect, it } from 'vitest';
import {
    assertSafeRemoteTarget,
    isBlockedHostname,
    isPrivateIpAddress,
    normalizeRemoteImageUrl,
} from './network.ts';

describe('normalizeRemoteImageUrl', () => {
    it('accepts plain http and https URLs', () => {
        expect(normalizeRemoteImageUrl('https://example.com/a.png').hostname).toBe('example.com');
        expect(normalizeRemoteImageUrl('  http://example.com/a.png ').protocol).toBe('http:');
    });

    it('rejects empty, invalid, and non-http inputs', () => {
        expect(() => normalizeRemoteImageUrl('')).toThrow(/required/);
        expect(() => normalizeRemoteImageUrl('not a url')).toThrow(/Invalid URL/);
        expect(() => normalizeRemoteImageUrl('file:///etc/passwd')).toThrow(/Only http\/https/);
        expect(() => normalizeRemoteImageUrl('ftp://example.com/a.png')).toThrow(
            /Only http\/https/,
        );
    });

    it('rejects embedded credentials', () => {
        expect(() => normalizeRemoteImageUrl('https://user:pw@example.com/a.png')).toThrow(
            /embedded credentials/,
        );
    });
});

describe('isBlockedHostname', () => {
    it('blocks localhost, its subdomains, and cloud metadata hostnames', () => {
        expect(isBlockedHostname('localhost')).toBe(true);
        expect(isBlockedHostname('LOCALHOST')).toBe(true);
        expect(isBlockedHostname('app.localhost')).toBe(true);
        expect(isBlockedHostname('metadata.google.internal')).toBe(true);
        expect(isBlockedHostname('')).toBe(true);
    });

    it('passes ordinary public hostnames', () => {
        expect(isBlockedHostname('example.com')).toBe(false);
        expect(isBlockedHostname('cdn.example.co.uk')).toBe(false);
    });
});

describe('isPrivateIpAddress', () => {
    it('flags every reserved IPv4 range', () => {
        for (const ip of [
            '0.0.0.0',
            '10.1.2.3',
            '100.64.0.9',
            '127.0.0.1',
            '169.254.169.254',
            '172.16.0.1',
            '172.31.255.255',
            '192.0.0.5',
            '192.168.1.1',
            '198.18.0.1',
            '224.0.0.1',
            '255.255.255.255',
        ]) {
            expect(isPrivateIpAddress(ip), ip).toBe(true);
        }
    });

    it('passes public IPv4 addresses', () => {
        for (const ip of ['1.1.1.1', '8.8.8.8', '93.184.216.34', '172.32.0.1', '198.20.0.1']) {
            expect(isPrivateIpAddress(ip), ip).toBe(false);
        }
    });

    it('flags loopback, link-local, unique-local, and mapped IPv6', () => {
        for (const ip of [
            '::1',
            '::',
            'fe80::1',
            'fc00::1',
            'fd12:3456::1',
            '::ffff:127.0.0.1',
            '::ffff:10.0.0.1',
            'ff02::1',
            '2001:db8::1',
        ]) {
            expect(isPrivateIpAddress(ip), ip).toBe(true);
        }
    });

    it('passes public IPv6 and treats garbage as private', () => {
        expect(isPrivateIpAddress('2606:4700:4700::1111')).toBe(false);
        expect(isPrivateIpAddress('not-an-ip')).toBe(true);
    });
});

describe('assertSafeRemoteTarget', () => {
    it('pins a literal public IP without a DNS lookup', async () => {
        const pinned = await assertSafeRemoteTarget(new URL('http://93.184.216.34/a.png'));
        expect(pinned).toEqual({ hostname: '93.184.216.34', address: '93.184.216.34', family: 4 });
    });

    it('rejects a literal private IP and a bracketed IPv6 loopback', async () => {
        await expect(assertSafeRemoteTarget(new URL('http://10.0.0.1/a.png'))).rejects.toThrow(
            /Blocked private or reserved image target/,
        );
        await expect(assertSafeRemoteTarget(new URL('http://[::1]/a.png'))).rejects.toThrow(
            /Blocked private or reserved image target/,
        );
    });

    it('rejects blocked hostnames before resolving anything', async () => {
        await expect(assertSafeRemoteTarget(new URL('http://localhost/a.png'))).rejects.toThrow(
            /Blocked/,
        );
    });
});
