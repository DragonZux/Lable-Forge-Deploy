import { useState, useEffect, useCallback } from 'react';
import { NotificationResponse, NotificationListResponse } from '@/types';
import { api } from '@/lib/api';

export function useNotifications(unreadOnly = false) {
  const [notifications, setNotifications] = useState<NotificationResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const res = await api.get<NotificationListResponse>(`/notifications?page=${page}&unread_only=${unreadOnly}`);
      if (page === 1) {
        setNotifications(res.data.notifications);
      } else {
        setNotifications(prev => [...prev, ...res.data.notifications]);
      }
      setTotal(res.data.total);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch notifications');
    } finally {
      setLoading(false);
    }
  }, [unreadOnly]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(() => fetchNotifications(1), 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  return { notifications, total, loading, error, refetch: () => fetchNotifications(1) };
}

export function useUnreadCount() {
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async () => {
    try {
      const res = await api.get<{ count: number }>('/notifications/unread-count');
      setCount(res.data.count);
    } catch {}
  }, []);

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  return { count, refetch: fetchCount, setCount };
}

export function useNotificationStream() {
  const [newNotification, setNewNotification] = useState<NotificationResponse | null>(null);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_ENABLE_NOTIFICATION_SSE !== 'true') {
      return;
    }

    let eventSource: EventSource | null = null;
    let retryTimeout: any = null;
    let retryDelay = 1000;
    let isClosed = false;

    const connect = () => {
      if (isClosed) return;
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
      eventSource = new EventSource(`${baseUrl}/notifications/stream`, { withCredentials: true });

      eventSource.addEventListener('notification', (event: any) => {
        const notification = JSON.parse(event.data);
        setNewNotification(notification);
        retryDelay = 1000; // Reset retry delay on success
      });

      eventSource.onerror = () => {
        eventSource?.close();
        retryTimeout = setTimeout(() => {
          if (isClosed) return;
          retryDelay = Math.min(retryDelay * 2, 30000);
          connect();
        }, retryDelay);
      };
    };

    connect();

    return () => {
      isClosed = true;
      eventSource?.close();
      clearTimeout(retryTimeout);
    };
  }, []);

  return { newNotification };
}

export function useMarkAsRead() {
  const { refetch: refetchCount } = useUnreadCount();
  
  const markAsRead = async (id: string) => {
    await api.post(`/notifications/${id}/read`);
    refetchCount();
  };

  const markAllAsRead = async () => {
    await api.post('/notifications/read-all');
    refetchCount();
  };

  return { markAsRead, markAllAsRead };
}
