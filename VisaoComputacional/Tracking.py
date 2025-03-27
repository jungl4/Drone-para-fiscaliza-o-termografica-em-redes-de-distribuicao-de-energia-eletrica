import cv2
import numpy as np

cap = cv2.VideoCapture(1) #Iniciando a captura de vídeo, na camera 0

tracking = False #Indicador se o tracking está ativo
roi_hist = None #Histograma da região de interesse (ROI: Region Of interest) Geralmente é a definição de bordas.
term_crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 10, 1) #termos/motivos para o algorítimo meanShift parar de buscar no frame,
            #ou por máximo de semelhança ou por tempo de iteração(repetições), respectivamente: TERM_CRITERIA_EPS e TERM_CRITERIA_COUNT
track_window = None #Armazena as cordenadas da janela de rastreaamento. (x, y, w, h). 
#Armazena em uma lista [0, 1, 2, 3] sendo = [cordenada x do canto superior esq. da ROI, cordanada y do canto superior esq. da ROI,
#                                            largura da ROI, altura da ROI]

def select_roi(event, x, y, flags, param): #Função para selecionar a região de interesse.
    global tracking, roi_hist, track_window
    if event == cv2.EVENT_LBUTTONDOWN: #Caso tenha sido apertado o botão esquerdo na janela da camera (left button down).
        track_window = cv2.selectROI("Tracking", frame, fromCenter=False, showCrosshair=True)
        #selectROI é uma função para selecionar a região de interesse de forma "manual", interativa.
        if track_window[2] > 0 and track_window[3] > 0:#track_window[2] e track_window[3] são respectivamente a largura e altura da ROI;
            roi = frame[int(track_window[1]): int(track_window[1] + track_window[3]), int(track_window[0]): int(track_window[0] + track_window[2])]
            #fatiamento da imagem, sendo [y1:y2, x1:x2] assim extraindo uma subregião retangular da imagem.
            # y1:y2 define as linhas da imagem a serem extraídas, x1:x2 define as colunas da imagem a serem extraídas 
            #y1:y2 -> int(track_window[1]) = y1, int(track_window[1] + track_window[3]) = y1 + altura = y2.
            #x1:x2 -> int(track_window[0]) = x1, int(track_window[0] + track_window[2]) = x1 + largura = x2.


            roi_hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)#Convertendo esse recorte do frame de BGR para HSV (Hue, Saturation, Value).
            #Separa a informação de cor (HUE) da de intensidade (Value). Isso é útil para rastreamento baseado em cor.

            roi_hist = cv2.calcHist([roi_hsv], [0], None, [180], [0, 180]) #([imagem de entrada], [calculando apenas no canal 0 (HUE) dos 3 (HSV) 
            #Usamos o HUE pois é a cor pura (independente da luminosidade ou saturação) aumenta a robustez a mudanças de iluminação.],
            #[Sem mascara opcional (ou seja, usa toda a iamgem)], [numero de bins do histograma]).

                                                                
            cv2.normalize(roi_hist, roi_hist, 0, 255, cv2.NORM_MINMAX)
            #(Variavel de entrada, variavel de saida, valor um, valor dois, valor um = min de saída e valor dois = max de saida).
            #Normalizando tornamos o histograma independente da tamanho da ROI. Ou seja facilita para comparar com outros de diferêntes tamanhos.
            #Melhora a consistência de rastreamento em diferentes condições.
            tracking = True
        else:
            tracking = False
            roi_hist = None
            track_window = None

cv2.namedWindow("Tracking")#Criando janela com o nome "tracking".
cv2.setMouseCallback("Tracking", select_roi)#O que ele chama com eventos do mouse, aqui definimos como chamado a função select_roi.

while True:
    ret, frame = cap.read() #Lendo um frame da câmera.
    
    if tracking and roi_hist is not None:
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        dst = cv2.calcBackProject([hsv], [0], roi_hist, [0, 180], 1) #Calcula a probabilidade de cada pixel pertencer ao objeto rastreado.
        #([ímagem de entrada], [utilizando somente o canal HUE para a backprojection (0)], histograma normalizado, [range dos valores para o canal HUE], fator de escala para o resultado)
        #BackProjection: Cria uma imagem onde cada pixel possui uma probabilidade de pertencer a aquele objeto. Um mapa de probabilidades / de calor.
        ret, track_window = cv2.meanShift(dst, track_window, term_crit) #Implementa o algorítimo meanShift.
#numero de iterações, janela de trackin (pos) = algorítimo meanshift(imagem de back projection, ultima pos da track window)
        x, y, w, h = track_window 
        cv2.rectangle(frame, (x,y), (x+w, y+h), (0, 255, 0), 1, 8) #Desenha um retângulo no frame
        cv2.putText(frame, "Tracking Ativo", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        coord_text = f"Object at: ({x}, {y})"
        cv2.putText(frame, coord_text, (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
    else:
        # Adiciona instruções quando o rastreamento não está ativo
        cv2.putText(frame, "Click and drag to select an object", (10, 30), 
                    cv2.FONT_HERSHEY_SCRIPT_SIMPLEX, 0.7, (0, 0, 255), 2)
    
    cv2.imshow("Tracking", frame)

    key = cv2.waitKey(1)&0xFF #Espera que uma tecla seja apertada por um milisegundo
    if key == ord('q'):
        break
    elif key == ord('r'):
        # Reset do rastreamento
        tracking = False
        roi_hist = None
        track_window = None
    
cap.release()
cv2.destroyAllWindows()
                
