#include <stdio.h>

#define M_MAX 20

int card[7];
int M, cnt;
long long K;

void swap(int &a, int &b) {
        int temp = a;
        a = b;
        b = temp;
}

bool isCycle() {
        for (int i = 0; i < 7; i++) {
                if (card[i] != i) return false;
        }
        return true;
}

int main() {
        int T; for (scanf("%d", &T); T--;) {
                scanf("%d", &M);
                scanf("%lld", &K);

                for (int i = 0; i < 7; i++) {
                        card[i] = i;
                }

                int a[M_MAX];
                int b[M_MAX];
                for (int i = 0; i < M; i++) {
                        scanf("%d %d", a + i, b + i);
                }

                cnt = 0;
                while (cnt < K) {
                        swap(card[a[cnt % M] - 1], card[b[cnt % M] - 1]);
                        cnt++;
                        if (isCycle() && cnt % M == 0) {
                                K = K % cnt;
                                cnt = 0;
                        }
                }

                for (int i = 0; i < 7; i++) {
                        printf("%d", card[i]);
                }

                printf("\n");
        }

        return 0;
}
