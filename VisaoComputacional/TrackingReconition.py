import cv2
import tensorflow as tf
import tensorflow_hub as hub
import numpy as np

# Carregar o modelo pré-treinado do TensorFlow Hub
model_url = "https://tfhub.dev/tensorflow/ssd_mobilenet_v2/2"
model = hub.load(model_url)

# Lista de classes (COCO dataset) atualizada
category_index = {
    2: {'id': 2, 'name': 'bicycle'},
    3: {'id': 3, 'name': 'car'},
    4: {'id': 4, 'name': 'motorcycle'},
    44: {'id': 44, 'name': 'bottle'},  # Adicionado garrafa
    27: {'id': 27, 'name': 'backpack'},  # Adicionado mochila (que pode ser confundida com óculos)
    31: {'id': 31, 'name': 'handbag'},  # Adicionado bolsa (que pode ser confundida com óculos)
    33: {'id': 33, 'name': 'suitcase'},
    1: {'id': 1, 'name': 'person'},  # Adicionado mala (que pode ser confundida com óculos)
    # Infelizmente, o modelo COCO padrão não tem uma classe específica para "óculos"
    # Você pode adicionar mais classes conforme necessário
}

def detect_fn(image):
    image = np.asarray(image)
    input_tensor = tf.convert_to_tensor(image)
    input_tensor = input_tensor[tf.newaxis,...]
    detections = model(input_tensor)
    return detections

cap = cv2.VideoCapture(1)  

tracking = False
tracker = None
tracked_class = None

while True:
    ret, frame = cap.read()
    if not ret:
        break

    if not tracking:
        # Realizar detecção
        image_np = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        detections = detect_fn(image_np)

        boxes = detections['detection_boxes'][0].numpy()
        classes = detections['detection_classes'][0].numpy().astype(np.int32)
        scores = detections['detection_scores'][0].numpy()

        # Encontrar a detecção com maior confiança
        best_score_idx = np.argmax(scores)
        if scores[best_score_idx] > 0.5:  # Threshold de confiança
            ymin, xmin, ymax, xmax = boxes[best_score_idx]
            bbox = (int(xmin * frame.shape[1]), int(ymin * frame.shape[0]),
                    int((xmax - xmin) * frame.shape[1]), int((ymax - ymin) * frame.shape[0]))
            
            # Iniciar o tracker
            tracker = cv2.legacy.TrackerKCF_create()
            tracker.init(frame, bbox)
            tracking = True
            class_id = classes[best_score_idx]
            tracked_class = category_index[class_id]['name'] if class_id in category_index else 'Unknown'

    if tracking:
        # Atualizar o tracker
        success, bbox = tracker.update(frame)
        if success:
            (x, y, w, h) = [int(v) for v in bbox]
            cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 255, 0), 2)
            
            # Adicionar o nome do objeto acima do retângulo
            label = f"{tracked_class}"
            label_size, baseline = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            y_label = max(y, label_size[1])
            cv2.rectangle(frame, (x, y_label - label_size[1] - 10), (x + label_size[0], y_label + baseline - 10), (255, 255, 255), cv2.FILLED)
            cv2.putText(frame, label, (x, y_label - 7), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)

            cv2.putText(frame, "Tracking Ativo", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        else:
            # Se o tracking falhar, voltar para detecção
            cv2.putText(frame, "Tracking falhou", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
            tracking = False
            tracked_class = None

    # Mostrar o frame
    cv2.imshow('Object Detection and Tracking', frame)

    # Sair se 'q' for pressionado
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()