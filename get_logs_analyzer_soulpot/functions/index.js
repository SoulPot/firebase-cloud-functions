// The Cloud Functions for Firebase SDK to create Cloud Functions and set up triggers.
const functions = require('firebase-functions');

// The Firebase Admin SDK to access Firestore.
const admin = require('firebase-admin');
var serviceAccount = require("./soulpot-5fbe6-firebase-adminsdk-9zrre-34464ab414.json");
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

exports.onAnalyzerValueChange = functions.region("europe-west1").firestore
    .document('analyzers/{analyzerID}')
    .onUpdate((change, context) => {
        const oldValue = change.before.data();
        const newValue = change.after.data();

        if (newValue.userID !== undefined) {

            admin.firestore().collection("plants").doc(newValue.plantID).get().then(plant => {
                const temperatureRecommendations = [plant.data()["min_temp"], plant.data()["max_temp"]];
                const humidityRecommendations = [plant.data()["min_soil_moist"], plant.data()["max_soil_moist"]];
                const luminosityRecommendations = [plant.data()["min_light_lux"], plant.data()["max_light_lux"]];

                // CHECK TEMPERATURE RECOMMENDATIONS

                if (newValue.temperature < temperatureRecommendations[0] && oldValue.temperature > temperatureRecommendations[0] && newValue.temperature > 255) {
                    console.log("lowTemperature function: temperature is too low for " + context.params.analyzerID);
                    admin.messaging().sendToTopic(newValue.userID, {
                        notification: {
                            title: "La température de " + newValue.name + " est trop basse !",
                            body: "La temperature de " + newValue.name + " est à " + newValue.temperature + "°C, alors que la température minimum recommandée est " + temperatureRecommendations[0] + "°C"
                        }
                    });
                } else if (newValue.temperature > temperatureRecommendations[1] && oldValue.temperature < temperatureRecommendations[1] && newValue.temperature > 255) {
                    console.log("lowTemperature function: temperature is too high for " + context.params.analyzerID);
                    admin.messaging().sendToTopic(newValue.userID, {
                        notification: {
                            title: "La température de " + newValue.name + " est trop haute !",
                            body: "La temperature de " + newValue.name + " est à " + newValue.temperature + "°C, alors que la température maximum recommandée est " + temperatureRecommendations[1] + "°C"
                        }
                    });
                }

                // CHECK HUMIDITY RECOMMENDATIONS

                if (newValue.humidity < humidityRecommendations[0] && oldValue.humidity > humidityRecommendations[0] && newValue.humidity > 0) {
                    console.log("lowHumidity function: humidity is too low for " + context.params.analyzerID);
                    admin.messaging().sendToTopic(newValue.userID, {
                        notification: {
                            title: "L'hygrométrie de " + newValue.name + " est trop basse !",
                            body: "L'hygrométrie de " + newValue.name + " est à " + newValue.humidity + "%, alors que l'hygrométrie minimale recommandée est de " + humidityRecommendations[0] + "%\nOuvrez l'application pour arroser votre plante à distance"
                        }
                    });
                } else if (newValue.humidity > humidityRecommendations[1] && oldValue.humidity < humidityRecommendations[1] && newValue.humidity > 0) {
                    console.log("lowHumidity function: humidity is too high for " + context.params.analyzerID);
                }

                // CHECK LUMINOSITY RECOMMENDATIONS

                if (newValue.luminosity < luminosityRecommendations[0] && oldValue.luminosity > luminosityRecommendations[0] && newValue.luminosity > 0) {
                    console.log("lowLuminosity function: luminosity is too low for " + context.params.analyzerID);
                    admin.messaging().sendToTopic(newValue.userID, {
                        notification: {
                            title: "Votre plante " + newValue.name + " ne reçoit pas assez de lumière !",
                            body: "La luminosité reçue par " + newValue.name + " est de " + newValue.luminosity + " lux, alors que la luminosité minimale recommandée est de " + luminosityRecommendations[0] + " lux"
                        }
                    });
                } else if (newValue.luminosity > luminosityRecommendations[1] && oldValue.luminosity < luminosityRecommendations[1] && newValue.luminosity > 0) {
                    console.log("lowLuminosity function: luminosity is too high for " + context.params.analyzerID);
                    admin.messaging().sendToTopic(newValue.userID, {
                        notification: {
                            title: "Votre plante " + newValue.name + " reçoit trop de lumière !",
                            body: "La luminosité reçue par " + newValue.name + " est de " + newValue.luminosity + " lux, alors que la luminosité maximale recommandée est de " + luminosityRecommendations[1] + " lux"
                        }
                    });
                }

                // UPDATE OBJECTIVES

                admin.firestore().collection('objectives').get().then(snapshot => {
                    snapshot.forEach(doc => {
                        let objectiveData = doc.data();

                        if (objectiveData['field'] !== undefined && !objectiveData['field'].includes("analyzers_count")) {
                            let valueToCheck, recommendations;

                            //Get recommandations
                            if (objectiveData['field'].includes("humidity")) {
                                valueToCheck = newValue.humidity;
                                recommendations = humidityRecommendations;
                            } else if (objectiveData['field'].includes("luminosity")) {
                                valueToCheck = newValue.luminosity;
                                recommendations = luminosityRecommendations;
                            } else if (objectiveData['field'].includes("temperature")) {
                                valueToCheck = newValue.temperature;
                                recommendations = temperatureRecommendations;
                            }

                            //Get in progress Objectives
                            admin.firestore().doc('users/' + newValue.userID + '/objectives_owned/' + doc.id).get().then(obj => {
                                if (recommendations[0] <= valueToCheck && valueToCheck <= recommendations[1]) {
                                    let today = new Date()

                                    if (obj.data() !== undefined) {
                                        objUserData = obj.data();
                                        if (objUserData['owned'] === undefined || objUserData['owned'] !== true) {
                                            let beginDate = objUserData['beginDate'] !== undefined ? objUserData['beginDate'].toDate() : new Date();
                                            duration = today - beginDate;

                                            let durationInDays = Math.floor(duration / 1000 / (3600 * 24)) + 1;
                                            let progress = 100 / objectiveData['objective_value'] * durationInDays;

                                            if (durationInDays >= objectiveData['objective_value']) {
                                                db.doc('users/' + newValue.userID + '/objectives_owned/' + doc.id).set({
                                                    status: progress,
                                                    owned: true,
                                                    beginDate: beginDate
                                                })
                                            } else {
                                                db.doc('users/' + newValue.userID + '/objectives_owned/' + doc.id).set({
                                                    status: progress,
                                                    owned: false,
                                                    beginDate: beginDate
                                                })
                                            }
                                        }
                                    } else {
                                        db.doc('users/' + newValue.userID + '/objectives_owned/' + doc.id).set({
                                            status: 1,
                                            owned: false,
                                            beginDate: today
                                        })
                                    }
                                } else {

                                    if (obj.data() !== undefined && obj.data()['owned'] !== undefined && obj.data()['owned'] !== true) {
                                        db.doc('users/' + newValue.userID + '/objectives_owned/' + doc.id).set({
                                            status: 0,
                                            owned: false
                                        })
                                    }
                                }
                            })
                        }
                    });
                })
            });

            if (oldValue.userID === undefined || oldValue.userID !== newValue.userID) {
                db.doc('users/' + newValue.userID).get().then(user => {
                    let analyzers_counter = user["analyzers_count"] === undefined ? 1 : user["analyzers_count"];
                    db.doc('users/' + newValue.userID).set({
                        analyzers_count: analyzers_counter,
                        isAdmin: user["isAdmin"] !== undefined ? user["isAdmin"] : false
                    })
                })
            }

        }
        return null;
    });


exports.onNewAnalyzer = functions.region("europe-west1").firestore
    .document('analyzers/{analyzerID}')
    .onCreate((snapshot, context) => {
        const newAnalyzer = snapshot.data();

        //Mise à jour du compteur d'Analyzers
        if (newAnalyzer["userID"] !== undefined) {
            db.doc('users/' + newAnalyzer["userID"]).get().then(obj => {
                counter = obj.data()["analyzers_count"] !== undefined ? obj.data()["analyzers_count"] : 0;

                db.doc('users/' + newAnalyzer["userID"]).update({
                    analyzers_count: counter + 1
                })
            })
        }
    });

exports.onDeleteAnalyzer = functions.region("europe-west1").firestore
    .document('analyzers/{analyzerID}')
    .onDelete((snapshot, context) => {
        const analyzer = snapshot;
        const deletedAnalyzer = snapshot.data();

        //Mise à jour du compteur d'Analyzers
        if (deletedAnalyzer["userID"] !== undefined) {
            db.doc('users/' + deletedAnalyzer["userID"]).get().then(obj => {
                counter = obj.data()["analyzers_count"] !== undefined ? obj.data()["analyzers_count"] - 1 : 0;
                db.doc('users/' + deletedAnalyzer["userID"]).update({
                    analyzers_count: counter
                })
            })
        }

        admin.firestore().collection('analyzers/' + snapshot.id + '/logs').get().then(snapshot => {
            snapshot.forEach(doc => {
                    db.doc('analyzers/' + analyzer.id + '/logs/' + doc.id).delete()
                }
            )
        })
    });

exports.onUpdateUser = functions.region("europe-west1").firestore
    .document('users/{userID}')
    .onUpdate((snapshot, context) => {
        const user = snapshot.after.data();

        //Mise à jour des objectifs
        if (user["analyzers_count"] !== undefined) {
            admin.firestore().collection('objectives').get().then(objectives => {
                objectives.forEach(doc => {
                    let objectiveData = doc.data();

                    admin.firestore().doc('users/' + context.params.userID + '/objectives_owned/' + doc.id).get().then(obj_own => {

                        let progress = user["analyzers_count"] * 100 / objectiveData["objective_value"];

                        if (obj_own.data() !== undefined) {
                            if (obj_own.data()["owned"] !== true) {
                                if (objectiveData["field"] !== undefined && objectiveData["field"].includes("analyzers_count")) {
                                    if (progress >= 100) {
                                        db.doc('users/' + context.params.userID + '/objectives_owned/' + doc.id).set({
                                            status: 100,
                                            owned: true,
                                            ownedDate: new Date()
                                        })
                                    } else {
                                        db.doc('users/' + context.params.userID + '/objectives_owned/' + doc.id).set({
                                            status: progress,
                                            owned: false,
                                        })
                                    }
                                }
                            }
                        } else {
                            if (progress >= 100) {
                                db.doc('users/' + context.params.userID + '/objectives_owned/' + doc.id).set({
                                    status: 100,
                                    owned: true,
                                    ownedDate: new Date()
                                })
                            } else {
                                db.doc('users/' + context.params.userID + '/objectives_owned/' + doc.id).set({
                                    status: progress,
                                    owned: false,
                                })
                            }
                        }
                    })
                })
            });
        }
    });


